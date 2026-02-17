import { ImageSource, MapMouseEvent, Popup } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bboxContainsPoint, createImageLayerParams } from '../tools';
import Map from '../components/map';
import MaterialIcon from '../components/material_icon';
import Spinner from '../components/spinner';
import NavBar from '../components/nav';
import Sidebar from '../components/sidebar';
import {
    useDatasetIdsQuery,
    useDatasetMetadataQuery,
    useDatasetMinMaxQuery,
    useDatasetsQuery,
} from '../query/datasets';
import Export from '../components/export';
import SimpleSelect from '../components/simple_select';

const colormaps: Array<{ id: string; name: string }> = [
    { id: 'rainbow', name: 'Rainbow' },
    { id: 'jet', name: 'Jet' },
    { id: 'turbo', name: 'Turbo' },
    { id: 'viridis', name: 'Viridis' },
    { id: 'plasma', name: 'Plasma' },
    { id: 'inferno', name: 'Inferno' },
    { id: 'magma', name: 'Magma' },
    { id: 'Greys', name: 'Greys' },
    { id: 'Blues', name: 'Blues' },
    { id: 'Reds', name: 'Reds' },
    { id: 'cool', name: 'Cool' },
    { id: 'hot', name: 'Hot' },
    { id: 'seismic', name: 'Seismic' },
];

const TILE_STYLE_OPTIONS: { value: string, label: string }[] = [
    { value: 'raster/default', label: 'Raster' },
    { value: 'vector-arrow/default', label: 'Vector - colormap' },
    { value: 'vector-arrow/none', label: 'Vector - arrows only' },
    { value: 'vector-arrow-color/default', label: 'Vector - colored arrows' },
    { value: 'vector-cells-arrow/default', label: 'Vector - cell center arrows' },
    { value: 'vector-cells-arrow/none', label: 'Vector - cell center arrows only' },
    { value: 'vector-cells-arrow-color/default', label: 'Vector - cell center colored arrows' },
];

const ARROW_DENSITY_OPTIONS: { value: number, label: string }[] =
    [1, 2, 3].map((n) => ({ value: n, label: n.toString() }))

const TILE_SIZE = 512;

function App() {
    const map = useRef<maplibregl.Map | null>(null);
    const lastClickPos = useRef<[number, number] | null>(null);

    const datasetIds = useDatasetIdsQuery();
    const datasets = useDatasetsQuery(datasetIds.data);

    const [selectedLayers, setSelectedLayer] = useState<{ dataset: string; variables: Set<string> } | undefined>(undefined);
    const selectedLayersMetadata = useDatasetMetadataQuery(selectedLayers);
    const firstLayer = selectedLayers?.variables.keys().next().value;
    // TODO: refactor all the references to this so it uses `selectedLayersMetadata`.
    // create a single query object just for the first layer to avoid refactoring for now
    const selectedLayerMetadata = {
        ...selectedLayersMetadata,
        data: firstLayer != null ? selectedLayersMetadata.data?.[firstLayer] : undefined,
    }
    const joinedLayers = useMemo(
        () => selectedLayers?.variables.values().toArray().join(','),
        [selectedLayers?.variables],
    )

    const [layerOptions, setLayerOptions] = useState<{
        date?: string;
        elevation?: string;
        colorscaleMin?: number;
        colorscaleMax?: number;
        colormap?: string;
        arrowColor?: string;
        styles?: string;
        density?: number;
    }>({});

    const selectedLayerMinMax = useDatasetMinMaxQuery(
        selectedLayers && selectedLayerMetadata.data
        && {
            dataset: selectedLayers.dataset,
            variable: joinedLayers,
            date:
                layerOptions.date ??
                selectedLayerMetadata.data.defaultTime,
            elevation:
                layerOptions.elevation ??
                selectedLayerMetadata.data.defaultElevation?.toString(),
        }
    );

    const [layerTiling, setLayerTiling] = useState<boolean>(true);
    const [currentPopupData, setCurrentPopupData] = useState<any>(undefined);

    const [showSidebar, setSidebarShowing] = useState(true);
    const [showColormapPicker, setColorMapPickerShowing] = useState(false);
    const [showAdvancedLayerOptions, setShowAdvancedLayerOptions] = useState(false);
    const [datasetsCollapsed, setDatasetsCollapsed] = useState<{
        [k: string]: boolean;
    }>({});
    const [layerLoading, setLayerLoading] = useState(false);

    const [selectedExportDataset, setSelectedExportDataset] = useState<string | undefined>(undefined);
    const selectedExportDatasetRef = useRef<string | undefined>(undefined);

    const layerTimeOptions = useMemo(() => selectedLayerMetadata.data?.times?.map(
        (date: string) => ({ value: date, label: date })
    ), [selectedLayerMetadata.data?.times])
    const selectMenuPortalTarget = typeof document !== 'undefined' ? document.body : undefined;

    useEffect(() => {
        const datasetsCollapsed = datasetIds.data?.reduce(
            (obj: { [k: string]: boolean }, id: string) => {
                obj[id] = true;
                return obj;
            },
            {},
        );
        setDatasetsCollapsed(datasetsCollapsed ?? {});
        // datasetIds.data?.forEach(async (datasetId) => {
        //     const dataset = await fetchDataset(datasetId);
        //     setDatasets((d) => ({ ...d, [datasetId]: dataset }));
        // });
    }, [datasetIds.data]);

    useEffect(() => {
        setShowAdvancedLayerOptions(false);
    }, [selectedLayers]);

    useEffect(() => {
        if (
            !map.current ||
            !selectedLayers ||
            !selectedLayerMetadata.data ||
            !selectedLayerMinMax.data
        ) {
            return;
        }

        const sourceId = `xreds-${selectedLayers.dataset}-${joinedLayers}`;

        console.log(`Adding layer: ${sourceId}`);
        
        const colorscaleMin = layerOptions.colorscaleMin ?? selectedLayerMinMax.data.min;
        const colorscaleMax = layerOptions.colorscaleMax ?? selectedLayerMinMax.data.max;
        const urlOptions = {
            colorscalerange: colorscaleMin != null && colorscaleMax != null ? `${colorscaleMin},${colorscaleMax}` : undefined,
            time: layerOptions.date ?? selectedLayerMetadata.data.defaultTime,
            elevation: layerOptions.elevation ?? selectedLayerMetadata.data.defaultElevation,
            color: layerOptions.arrowColor, // color of arrows when rendering vectors
            density: layerOptions.density, // density of arrows when rendering vectors
            styles: (
                layerOptions.styles ?? `${selectedLayers.variables.size === 1 ? 'raster' : 'vector-arrow'}/default`
            ).replace('default', layerOptions.colormap ?? 'default'),
        };

        let url = `/datasets/${selectedLayers.dataset}/wms/?service=WMS&version=1.3.0&request=GetMap&layers=${joinedLayers}&crs=EPSG:3857`;
        const urlOptsString = Object.entries(urlOptions)
            .filter(([_, val]) => val != null && val !== '')
            .map(([key, val]) => `&${key}=${encodeURIComponent(String(val))}`)
            .join('');
        url += urlOptsString;

        if (layerTiling) {
            url += `&width=${TILE_SIZE}&height=${TILE_SIZE}&bbox={bbox-epsg-3857}`;

            map.current.addSource(sourceId, {
                type: 'raster',
                tiles: [url],
                tileSize: TILE_SIZE,
                bounds: selectedLayerMetadata.data.bbox,
            });
        } else {
            const imgParams = createImageLayerParams(map.current);
            if (!imgParams) {
                return;
            }

            url += `&width=${imgParams.width}&height=${imgParams.height}&bbox=${[...imgParams.mercator].join(',')}`;
            map.current.addSource(sourceId, {
                type: 'image',
                url: url,
                coordinates: imgParams.coordinates as any,
            });
        }

        map.current.addLayer({
            id: sourceId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.75,
                ...(!layerTiling && { 'raster-fade-duration': 0 }),
            },
        });

        setLayerLoading(true);

        const onIdle = () => setLayerLoading(false);

        const onClick = async (e: MapMouseEvent) => {
            if (
                selectedExportDatasetRef.current !== undefined ||
                (selectedLayerMetadata.data?.bbox && !bboxContainsPoint(selectedLayerMetadata.data.bbox, e.lngLat))
            ) {
                setCurrentPopupData(undefined);
                return;
            }

            setCurrentPopupData({
                data: undefined,
                loading: true,
                lngLat: e.lngLat,
            });
            lastClickPos.current = [e.lngLat.lng, e.lngLat.lat];

            try {
                const bbox = `&bbox=${e.lngLat.lng - 0.1},${e.lngLat.lat - 0.1},${e.lngLat.lng + 0.1},${e.lngLat.lat + 0.1}`;
                const time =
                    (layerOptions.date ??
                        selectedLayerMetadata.data?.defaultTime) !== undefined
                        ? `&time=${layerOptions.date ?? selectedLayerMetadata.data?.defaultTime}`
                        : '';

                const elevation =
                    (layerOptions.elevation ??
                        selectedLayerMetadata.data?.defaultElevation) !==
                    undefined
                        ? `&elevation=${layerOptions.elevation ?? selectedLayerMetadata.data?.defaultElevation}`
                        : '';

                const response = await fetch(
                    `/datasets/${selectedLayers.dataset}/wms/?service=WMS&REQUEST=GetFeatureInfo&LAYERS=${joinedLayers}&VERSION=1.3.0&EXCEPTIONS=application%2Fvnd.ogc.se_xml&SRS=EPSG%3A4326&QUERY_LAYERS=${joinedLayers}&INFO_FORMAT=text%2Fjson&WIDTH=101&HEIGHT=101&X=50&Y=50${bbox}${time}${elevation}`,
                );
                const data = await response.json();

                if (
                    lastClickPos.current &&
                    lastClickPos.current[0] === e.lngLat.lng &&
                    lastClickPos.current[1] === e.lngLat.lat
                ) {
                    setCurrentPopupData({
                        data: data,
                        loading: false,
                        lngLat: e.lngLat,
                    });
                }
            } catch (e) {
                console.error(e);

                setCurrentPopupData(undefined);
                lastClickPos.current = null;
            }
        };

        const onMove = () => {
            const currentSource = map.current?.getSource(sourceId) as
                | ImageSource
                | undefined;
            if (!map.current || !currentSource) {
                return;
            }

            const imgParams = createImageLayerParams(map.current);
            if (!imgParams) {
                return;
            }

            let url = `/datasets/${selectedLayers.dataset}/wms/?service=WMS&version=1.3.0&request=GetMap&layers=${joinedLayers}&crs=EPSG:3857&styles=raster/${layerOptions.colormap ?? 'default'}&width=${imgParams.width}&height=${imgParams.height}&bbox=${[...imgParams.mercator].join(',')}`;
            url += urlOptsString;

            currentSource.updateImage({
                url: url,
                coordinates: imgParams.coordinates as any,
            });
        };

        map.current.on('idle', onIdle);
        map.current.on('click', onClick);
        if (!layerTiling) {
            map.current.on('moveend', onMove);
        }

        return () => {
            console.log(`Removing layer: ${sourceId}`);
            setCurrentPopupData(undefined);
            setLayerLoading(false);
            map.current?.off('click', onClick);
            map.current?.off('idle', onIdle);
            map.current?.off('moveend', onMove);
            map.current?.removeLayer(sourceId);
            map.current?.removeSource(sourceId);
        };
    }, [
        selectedLayerMetadata.data,
        selectedLayerMinMax.data,
        layerTiling,
        layerOptions.colorscaleMin,
        layerOptions.colorscaleMax,
        layerOptions.colormap,
        layerOptions.arrowColor,
        layerOptions.density,
        layerOptions.styles,
    ]);

    useEffect(() => {
        if (
            !map.current ||
            !currentPopupData ||
            !selectedLayers ||
            !selectedLayerMetadata.data
        ) {
            return;
        }

        let popup: Popup;
        try {
            popup = new Popup({ closeOnClick: false })
                .setLngLat(currentPopupData.lngLat)
                // TODO: units for multiple layers? other way of getting them or fix the metadata query?
                .setHTML(getPopupHTML(currentPopupData, selectedLayers.dataset, selectedLayers.variables, joinedLayers, selectedLayerMetadata.data?.units))
                .addTo(map.current);
        } catch (e) {
            console.error(e);

            popup = new Popup({ closeOnClick: false })
                .setLngLat(currentPopupData.lngLat)
                .setHTML(
                    `
          <div class="flex flex-col p-1 rounded-md overflow-hidden">
            <span class="font-bold">${selectedLayers.dataset} - ${joinedLayers}</span>
              <span class="text-center">ERROR</span>
          </div>
        `,
                )
                .addTo(map.current);
        }

        return () => {
            popup.remove();
        };
    }, [currentPopupData]);

    useEffect(() => {
        selectedExportDatasetRef.current = selectedExportDataset;
    }, [selectedExportDataset])

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
            <NavBar
                showSidebar={showSidebar}
                setSidebarShowing={(show) => {
                    if (selectedExportDatasetRef.current !== undefined) {
                        setSelectedExportDataset(undefined);
                    } else {
                        setSidebarShowing(show);
                    }
                }}
            />

            <main className="flex flex-row flex-1">
                <Sidebar showSidebar={showSidebar}>
                    {datasetIds.isLoading ? (
                        <div className="flex-1 flex justify-center items-center">
                            <Spinner />
                        </div>
                    ) : (
                        <>
                            <div
                                className={
                                    'flex flex-row w-full justify-between items-center mb-4 px-1'
                                }
                            >
                                <h1 className="text-xl font-bold">Datasets</h1>
                                <div className={'flex flex-row items-center'}>
                                    <h5 className={'pr-2'}>Layer Tiling</h5>
                                    <input
                                        type={'checkbox'}
                                        checked={layerTiling}
                                        onChange={(e) =>
                                            setLayerTiling(e.target.checked)
                                        }
                                    />
                                </div>
                            </div>
                            {datasetIds.data?.map((d, i) => (
                                <section key={d}>
                                    <div className="flex flex-row justify-between items-center content-center">
                                        <div
                                            className={
                                                'flex flex-row justify-start items-center cursor-pointer'
                                            }
                                            onClick={() =>
                                                setDatasetsCollapsed(
                                                    (datasetsCollapsed) => ({
                                                        ...datasetsCollapsed,
                                                        [d]: !datasetsCollapsed[
                                                            d
                                                        ],
                                                    }),
                                                )
                                            }
                                        >
                                            <MaterialIcon
                                                className="pr-4 self-center align-middle transition-all hover:text-blue-600"
                                                name={
                                                    !datasetsCollapsed[d]
                                                        ? 'remove_circle'
                                                        : 'add_circle'
                                                }
                                                title={
                                                    !datasetsCollapsed[d]
                                                        ? 'Hide Layers'
                                                        : 'Show Layers'
                                                }
                                            />

                                            <h2 className="text-lg font-bold px-1">
                                                {d}
                                            </h2>
                                        </div>
                                        <div className="flex flex-row justify-between items-center content-center">
                                            {datasets.at(i)?.isError && (
                                                <MaterialIcon
                                                    className="pr-4 self-center align-middle transition-all text-red-400 hover:text-red-800"
                                                    name="error"
                                                    title="Error fetching dataset"
                                                />
                                            )}
                                            {datasets.at(i)?.isFetching && (
                                                <div className="flex-1 flex justify-center items-center pr-[1.1rem]">
                                                    <Spinner />
                                                </div>
                                            )}
                                            {datasets.at(i)?.isFetched && (
                                                <>
                                                    <a
                                                        target="_blank"
                                                        href={`/datasets/${datasetIds.data.at(i)}/`}
                                                    >
                                                        <MaterialIcon
                                                            className="pr-2 self-center align-middle transition-all hover:text-blue-400"
                                                            name="info"
                                                            title="Dataset info"
                                                            onClick={() => {}}
                                                        />
                                                    </a>
                                                    <MaterialIcon
                                                        className="self-center align-middle transition-all hover:text-blue-400"
                                                        name="output"
                                                        title="Subset and Export"
                                                        onClick={() =>{ 
                                                            setSelectedExportDataset(datasetIds.data.at(i));
                                                            setCurrentPopupData(undefined);
                                                            lastClickPos.current = null;
                                                        }}
                                                    />
                                                </>
                                            )}
                                            {/* <MaterialIcon
                                                className="pr-4 self-center align-middle transition-all hover:text-blue-600"
                                                name="integration_instructions"
                                                title="Launch in JupyterHub"
                                                onClick={() => {}}
                                            /> */}
                                            {/* <MaterialIcon
                                                className="self-center align-middle transition-all hover:text-blue-600"
                                                name="dynamic_form"
                                                title="Access via OpenDAP"
                                                onClick={() => {}}
                                            /> */}
                                        </div>
                                    </div>
                                    {!datasetsCollapsed[d] &&
                                        Object.keys(
                                            datasets.at(i)?.data ?? {},
                                        ).map((v) => (
                                            <div
                                                key={d + v}
                                                className={`p-1 flex flex-row justify-between items-center ${selectedLayers?.dataset === d && selectedLayers.variables.has(v) ? 'bg-blue-100' : ''}`}
                                            >
                                                <button
                                                    className={`hover:text-blue-600 text-start`}
                                                    onClick={(event) => {
                                                        setLayerOptions({})
                                                        setSelectedLayer((old) => {
                                                            if (old && old.dataset === d && old.variables.has(v)) {
                                                                return undefined;
                                                            }
                                                            return (event.ctrlKey || event.metaKey) && old?.variables.size == 1 ? {
                                                                    dataset: d,
                                                                    variables: new Set([...old.variables.values(), v])
                                                                } : {
                                                                dataset: d,
                                                                variables: new Set([v]),
                                                            };
                                                        });
                                                    }}
                                                >
                                                    {v}{' '}
                                                    <span className="opacity-30">
                                                        {
                                                            datasets.at(i)
                                                                ?.data?.[v]
                                                        }
                                                    </span>
                                                </button>
                                                {selectedLayers?.dataset === d &&
                                                    joinedLayers ===
                                                        v &&
                                                    (layerLoading ||
                                                        selectedLayerMinMax.isFetching ||
                                                        selectedLayerMetadata.isFetching) && (
                                                        <div className="flex items-center justify-center">
                                                            <Spinner />
                                                        </div>
                                                    )}
                                            </div>
                                        ))}
                                </section>
                            ))}
                        </>
                    )}
                </Sidebar>
                <Sidebar showSidebar={selectedExportDataset !== undefined}>
                    {selectedExportDataset !== undefined && (
                        <Export map={map} dataset={selectedExportDataset} />
                    )}
                </Sidebar>
                <div className="flex-1">
                    <Map
                        map={map}
                        style="https://api.maptiler.com/maps/basic-v2-light/style.json?key=x5EfXrIDiRScOPCSUPJ6"
                        // style='https://api.maptiler.com/maps/ocean/style.json?key=x5EfXrIDiRScOPCSUPJ6'
                        viewport={{
                            center: [-71, 41],
                            zoom: 3,
                        }}
                    />
                </div>
                {selectedLayers && (
                    <div className="absolute top-12 right-2 md:right-4 w-72 md:w-96 overflow-visible z-10">
                        <div className="bg-white rounded-md bg-opacity-70 flex flex-col items-center content-center">
                        <span className="text-center">
                            {selectedLayers.dataset} - {joinedLayers}
                        </span>
                        {selectedLayerMinMax.isFetching ||
                        selectedLayerMetadata.isFetching ||
                        !selectedLayerMetadata.data ? (
                            <div className="flex-1 flex justify-center items-center">
                                <Spinner />
                            </div>
                        ) : (
                            <>
                                <span className="font-bold text-center">
                                    {selectedLayerMetadata.data.title} (
                                    {selectedLayerMetadata.data.units})
                                </span>
                                <div
                                    className={
                                        'flex flex-col w-full justify-around items-center'
                                    }
                                >
                                    <div
                                        className={'flex flex-row items-center pt-2'}
                                    >
                                        <span className={'pl-1'}>Date:</span>
                                        <SimpleSelect
                                            key={"date-dropdown"}
                                            className="rounded-md mx-1 w-[14rem]"
                                            menuPlacement={"bottom"}
                                            menuPosition={"fixed"}
                                            menuPortalTarget={selectMenuPortalTarget}
                                            isSearchable={false}
                                            value={{
                                                value: layerOptions?.date ?? selectedLayerMetadata.data.defaultTime,
                                                label: layerOptions?.date ?? selectedLayerMetadata.data.defaultTime,
                                            }}
                                            onChange={(e: any) =>
                                                setLayerOptions({
                                                    ...layerOptions,
                                                    date: e.value,
                                                })
                                            }
                                            options={layerTimeOptions}
                                        />
                                    </div>
                                    {selectedLayerMetadata.data
                                        .defaultElevation !== undefined && (
                                        <div
                                            className={
                                                'flex flex-row items-center pt-1'
                                            }
                                        >
                                            <span className={'pl-1'}>
                                                Elevation:
                                            </span>
                                            <SimpleSelect
                                                className="rounded-md mx-1 w-[12rem]"
                                                menuPlacement={"bottom"}
                                                menuPosition={"fixed"}
                                                menuPortalTarget={selectMenuPortalTarget}
                                                isSearchable={false}
                                                value={{
                                                    value: layerOptions?.elevation ?? selectedLayerMetadata.data.defaultElevation.toString(),
                                                    label: layerOptions?.elevation ?? selectedLayerMetadata.data.defaultElevation.toString(),
                                                }}
                                                onChange={(e: any) =>
                                                    setLayerOptions({
                                                        ...layerOptions,
                                                        elevation: e.value,
                                                    })
                                                }
                                                options={selectedLayerMetadata.data.elevations?.map(
                                                    (e: number) => ({ value: e.toString(), label: +e.toFixed(4) })
                                                )}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="w-full flex-1 flex flex-row items-center content-center justify-around relative">
                                    <input
                                        className="w-16 mx-1 text-center rounded-md px-1 border border-solid border-[#cccccc]
                                                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        defaultValue={(layerOptions.colorscaleMin ?? selectedLayerMinMax.data?.min ?? 0).toFixed(3)}
                                        type={'number'}
                                        max={layerOptions.colorscaleMax ?? selectedLayerMinMax.data?.max}
                                        onBlur={(e) =>
                                            setLayerOptions({
                                                ...layerOptions,
                                                colorscaleMin:
                                                    e.currentTarget
                                                        .valueAsNumber,
                                            })
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                setLayerOptions({
                                                    ...layerOptions,
                                                    colorscaleMin:
                                                        e.currentTarget
                                                            .valueAsNumber,
                                                });
                                            }
                                        }}
                                    />
                                    <img
                                        className="rounded-md overflow-hidden w-64 md:w-80 mx-1 cursor-pointer"
                                        src={`/datasets/${selectedLayers.dataset}/wms/?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=200&height=20&layers=${joinedLayers}&styles=raster/${layerOptions.colormap ?? 'default'}&colorscalerange=${layerOptions.colorscaleMin?.toFixed(5) ?? 0},${layerOptions.colorscaleMax?.toFixed(5) ?? 10}`}
                                        onClick={() =>
                                            setColorMapPickerShowing(
                                                !showColormapPicker,
                                            )
                                        }
                                    />
                                    {showColormapPicker && (
                                        <div className="absolute top-full mt-1 right-0 h-64 w-72 md:w-96 pt-2 px-2 bg-white overflow-y-scroll">
                                            <menu>
                                                {colormaps.map((cm) => (
                                                    <li className="w-full h-2 mb-8">
                                                        <img
                                                            className="rounded-md overflow-hidden w-full cursor-pointer"
                                                            src={`/datasets/${selectedLayers.dataset}/wms/?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=200&height=20&layers=${joinedLayers}&styles=raster/${cm.id}&colorscalerange=${layerOptions.colorscaleMin ?? 0},${layerOptions.colorscaleMax ?? 10}`}
                                                            onClick={() => {
                                                                setLayerOptions(
                                                                    {
                                                                        ...layerOptions,
                                                                        colormap:
                                                                            cm.id,
                                                                    },
                                                                );
                                                                setColorMapPickerShowing(
                                                                    !showColormapPicker,
                                                                );
                                                            }}
                                                        />
                                                    </li>
                                                ))}
                                            </menu>
                                        </div>
                                    )}
                                    <input
                                        className="w-16 mx-1 text-center rounded-md px-1 border border-solid border-[#cccccc] 
                                                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        defaultValue={(layerOptions.colorscaleMax ?? selectedLayerMinMax.data?.max ?? 10).toFixed(3)}
                                        type={'number'}
                                        min={layerOptions.colorscaleMin ?? selectedLayerMinMax.data?.min}
                                        onBlur={(e) =>
                                            setLayerOptions({
                                                ...layerOptions,
                                                colorscaleMax:
                                                    e.currentTarget
                                                        .valueAsNumber,
                                            })
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                setLayerOptions({
                                                    ...layerOptions,
                                                    colorscaleMax:
                                                        e.currentTarget
                                                            .valueAsNumber,
                                                });
                                            }
                                        }}
                                    />
                                </div>
                                <button
                                    className="my-1 text-sm underline cursor-pointer"
                                    onClick={() =>
                                        setShowAdvancedLayerOptions(!showAdvancedLayerOptions)
                                    }
                                >
                                    Advanced {showAdvancedLayerOptions ? '▴' : '▾'}
                                </button>
                                {showAdvancedLayerOptions && (
                                    <>
                                        <div
                                            className={'flex flex-row items-center py-1'}
                                        >
                                            <span className={'pl-1'}>Tile style:</span>
                                            <SimpleSelect
                                                className="rounded-md mx-1 w-[14rem]"
                                                menuPlacement={"bottom"}
                                                menuPosition={"fixed"}
                                                menuPortalTarget={selectMenuPortalTarget}
                                                isSearchable={false}
                                                value={{
                                                    value: layerOptions?.styles ?? "",
                                                    label: layerOptions?.styles ?? "",
                                                }}
                                                onChange={(e: any) =>
                                                    setLayerOptions({
                                                        ...layerOptions,
                                                        styles: e.value,
                                                    })
                                                }
                                                options={TILE_STYLE_OPTIONS.filter((opt) => opt.value.includes(selectedLayers.variables.size === 1 ? 'raster' : 'vector'))}
                                            />
                                        </div>
                                        {selectedLayers.variables.size > 1 &&
                                            <>
                                                <div
                                                    className={'flex flex-row items-center py-1'}
                                                >
                                                    <span className={'pl-1'}>Arrow color:</span>
                                                    <input
                                                        className="w-[9rem] mx-1 rounded-md px-1 border border-solid border-[#cccccc]"
                                                        type="text"
                                                        placeholder="e.g. #000000"
                                                        value={layerOptions.arrowColor ?? ''}
                                                        onChange={(e) =>
                                                            setLayerOptions({
                                                                ...layerOptions,
                                                                arrowColor:
                                                                    e.currentTarget.value || undefined,
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div
                                                    className={'flex flex-row items-center py-1'}
                                                >
                                                    <span className={'pl-1'}>Arrow density:</span>
                                                    <SimpleSelect
                                                        className="rounded-md mx-1 w-[5rem]"
                                                        menuPlacement={"bottom"}
                                                        menuPosition={"fixed"}
                                                        menuPortalTarget={selectMenuPortalTarget}
                                                        isSearchable={false}
                                                        value={{
                                                            value: layerOptions?.density ?? "",
                                                            label: layerOptions?.density?? "",
                                                        }}
                                                        onChange={(e: any) =>
                                                            setLayerOptions({
                                                                ...layerOptions,
                                                                density: parseInt(e.value),
                                                            })
                                                        }
                                                        options={ARROW_DENSITY_OPTIONS}
                                                    />
                                                </div>
                                            </>
                                        }
                                    </>
                                )}
                            </>
                        )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

/**
 * Generate a timeseries extraction popup.
 */
function getPopupHTML(currentPopupData: any, datasetName: string, layerNames: Set<string>, joinedLayers?: string, units?: string) {
    const data = currentPopupData.data;
    const values = layerNames.values().map((layer) => [layer, data?.ranges[layer].values[0]]).toArray();
    if (layerNames.size == 2) {
        // if there are two layers we assume they are vector layers and calculate magnitude
        values.push([
            "magnitude",
            Math.sqrt(values[0][1] ** 2 + values[1][1] ** 2),
        ])
    }

    return (
        `
          <div class="flex flex-col p-1 rounded-md overflow-hidden">
            <span class="font-bold">${datasetName} - ${joinedLayers}</span>
            ${currentPopupData.loading || joinedLayers == null
            ? `
                <div class="flex flex-row flex-grow justify-center items-center">
                  <div class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                    <span class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                      Loading...
                    </span>
                  </div>
                </div>
              `
            : `
                <span>Latitude: ${currentPopupData.lngLat.lat.toFixed(5)}°</span>
                <span>Longitude: ${currentPopupData.lngLat.lng.toFixed(5)}°</span>
                <span>Date: ${data.domain.axes.t ? data.domain.axes.t.values : 'N/A'}</span>
                ${layerNames.size > 1
                ? `
                    <span>Values:</span>
                    ${values.map(([layer, value]) => `
                        <span class="ml-2">${layer}: ${value.toFixed(5).replace(/0+$/, '')} ${units}</span>
                    `).join("\n")}
                  `
                : `<span>Value: ${data.ranges[joinedLayers].values[0]} ${units}</span>`
            }
              `
        }
          </div>
        `
    )
}

export default App;
