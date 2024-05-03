import { useEffect, useRef, useState } from 'react';
import NavBar from '../components/nav';
import Sidebar from '../components/sidebar';
import Map from '../components/map';

import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import Spinner from '../components/spinner';
import { useQuery } from '@tanstack/react-query';
import CopyUrl from '../components/copy_url';
import { useSearchParams } from 'react-router-dom';
import { useDatasetIdsQuery } from '../query/datasets';

const useExportThreshold = () =>
    useQuery({
        queryKey: ['export_threshold'],
        queryFn: async () => {
            const response = await fetch('/export/threshold');
            const { threshold } = await response.json();
            return threshold as number;
        },
    });

const useDatasetAvailableDates = (datasetId: string | undefined) =>
    useQuery({
        queryKey: ['subset_times', datasetId],
        queryFn: async (): Promise<[Date, Date] | undefined> => {
            if (!datasetId) {
                return undefined;
            }

            const response = await fetch(
                `/datasets/${datasetId}/subset_support/time_range`,
            );
            const { min_time, max_time } = await response.json();
            const min = new Date(min_time);
            const max = new Date(max_time);
            return [min, max];
        },
        enabled: !!datasetId,
    });

const useSelectedDatasetSize = (url: string | undefined) =>
    useQuery({
        queryKey: ['dataset_size', url],
        queryFn: async (): Promise<
            { size: number; unit: string } | undefined
        > => {
            if (!url) {
                return undefined;
            }

            const response = await fetch(`${url}/size/`);
            return await response.json();
        },
        enabled: !!url,
    });

function formatDateForInput(date: Date) {
    return date.toISOString().slice(0, 16);
}

function formatTimeForQuery({
    startDate,
    endDate,
}: {
    startDate?: Date;
    endDate?: Date;
}): string {
    if (!startDate || !endDate) {
        return '';
    }

    return `TIME(${startDate.toISOString()},${endDate.toISOString()})`;
}

function formatAreaForQuery(area: GeoJSON.Feature | undefined): string {
    if (!area) {
        return '';
    }

    const polygon = area.geometry as GeoJSON.Polygon;
    const coordinates = polygon.coordinates[0]
        .map(([lng, lat]) => `${lng} ${lat}`)
        .join(',');

    return `POLYGON((${coordinates}))`;
}

export default function SubsetTool() {
    const [searchParams, setSearchParams] = useSearchParams();

    const map = useRef<maplibregl.Map | null>(null);
    const draw = useRef<MapboxDraw>(
        new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                polygon: true,
                trash: true,
            },
            defaultMode: 'draw_polygon',
        }),
    );
    const [showSidebar, setSidebarShowing] = useState(true);

    const exportThreshold = useExportThreshold();
    const datasetIds = useDatasetIdsQuery();
    // const datasets = useDatasetsQuery(datasetIds.data);

    const [selectedDataset, setSelectedDataset] = useState<number | undefined>(
        undefined,
    );
    const availableDates = useDatasetAvailableDates(
        selectedDataset ? datasetIds.data?.at(selectedDataset) : undefined,
    );
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [isSelectingArea, setIsSelectingArea] = useState(false);
    const [selectedArea, setSelectedArea] = useState<
        GeoJSON.Feature | undefined
    >(undefined);
    const [selectedDatasetUrl, setSelectedDatasetUrl] = useState<
        string | undefined
    >(undefined);

    const selectedDatasetSize = useSelectedDatasetSize(selectedDatasetUrl);

    function updateSelectedArea(e: any) {
        const data = draw.current.getAll();
        if (data.features.length === 0) {
            setSelectedArea(undefined);
            return;
        }

        setSelectedArea(data.features[0]);
    }

    useEffect(() => {
        setStartDate(undefined);
        setEndDate(undefined);
        setSelectedArea(undefined);
    }, [selectedDataset]);

    useEffect(() => {
        const queriedDataset = searchParams.get('dataset');
        if (!queriedDataset) {
            return;
        }

        const datasetId = datasetIds.data?.findIndex((id) => id === queriedDataset);
        if (datasetId === -1) {
            return;
        }

        setSelectedDataset(datasetId);
    }, [datasetIds.data, searchParams]);

    useEffect(() => {
        if (!isSelectingArea || !map.current) {
            return;
        }

        console.log('Adding draw control');

        // @ts-ignore
        if (map.current.hasControl(draw.current)) {
            console.warn('This should not happen');
            return;
        }

        // @ts-ignore
        map.current.addControl(draw.current);

        map.current.on('draw.create', updateSelectedArea);
        map.current.on('draw.delete', updateSelectedArea);
        map.current.on('draw.update', updateSelectedArea);

        return () => {
            // @ts-ignore
            map.current?.removeControl(draw.current);
            map.current?.off('draw.create', updateSelectedArea);
            map.current?.off('draw.delete', updateSelectedArea);
            map.current?.off('draw.update', updateSelectedArea);
        };
    }, [isSelectingArea]);

    useEffect(() => {
        if (!selectedDataset || !datasetIds.data) {
            setSelectedDatasetUrl(undefined);
            return;
        }

        const datasetId = datasetIds.data.at(selectedDataset);
        if (!datasetId) {
            setSelectedDatasetUrl(undefined);
            return;
        }

        let baseUrl = `/datasets/${datasetId}/`;

        const time = formatTimeForQuery({ startDate, endDate });
        const area = formatAreaForQuery(selectedArea);
        if (time.length === 0 && area.length === 0) {
            setSelectedDatasetUrl(baseUrl);
            return;
        }

        const separator = time.length > 0 && area.length > 0 ? '&' : '';

        const subsetUrl = encodeURI(
            `${baseUrl}subset/${area}${separator}${time}/`,
        );
        setSelectedDatasetUrl(subsetUrl);
    }, [selectedDataset, startDate, endDate, selectedArea]);

    useEffect(() => {
        if (!selectedArea || !map.current) {
            return;
        }

        map.current.addSource('selected-area', {
            type: 'geojson',
            data: selectedArea,
        });

        map.current.addLayer({
            id: 'selected-area',
            type: 'fill',
            source: 'selected-area',
            paint: {
                'fill-color': '#088',
                'fill-opacity': 0.5,
            },
        });

        return () => {
            if (!map.current) {
                return;
            }

            map.current.removeLayer('selected-area');
            map.current.removeSource('selected-area');
        };
    }, [selectedArea]);

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
            <NavBar
                showSidebar={showSidebar}
                setSidebarShowing={setSidebarShowing}
            />
            <Sidebar showSidebar={showSidebar}>
                <div className="flex flex-col py-2">
                    <h1 className="text-2xl font-bold">Subset and Export</h1>

                    {datasetIds.isFetching && (
                        <div className='w-full flex flex-row justify-center'>
                            <Spinner />
                        </div>
                    )}

                    <form className="mt-4">
                        <label htmlFor="dataset">
                            <span className="text-gray-400 text-xl">
                                Select a dataset to subset
                            </span>
                            <select
                                className="mt-2 p-2 border border-gray-300 text-black rounded-md w-full"
                                value={selectedDataset}
                                onChange={(e) =>
                                    setSelectedDataset(e.target.selectedIndex)
                                }
                            >
                                {datasetIds.data &&
                                    datasetIds.data.map((id, i) => (
                                        <option key={id} value={i}>
                                            {id}
                                        </option>
                                    ))}
                            </select>
                        </label>

                        {selectedDataset && (
                            <div>
                                {availableDates.isLoading && (
                                    <div className='w-full flex flex-row justify-center py-3'>
                                        <Spinner />
                                    </div>
                                )}
                                {availableDates.data && (
                                    <div className="mt-4">
                                        <label>
                                            <span className="text-gray-400 text-xl">
                                                Select the start and end date
                                            </span>
                                            <div className="flex flex-col w-full">
                                                <div className="flex flex-row justify-between items-center mt-2">
                                                    <label className="w-1/4 text-gray-400">
                                                        Start date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        min={formatDateForInput(
                                                            availableDates
                                                                .data[0],
                                                        )}
                                                        max={formatDateForInput(
                                                            endDate ??
                                                                availableDates
                                                                    .data[1],
                                                        )}
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2"
                                                        onChange={(e) =>
                                                            setStartDate(
                                                                new Date(
                                                                    e.target.value,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <div className="flex flex-row justify-between items-center mt-2">
                                                    <label className="w-1/4 text-gray-400">
                                                        End date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2"
                                                        min={formatDateForInput(
                                                            startDate ??
                                                                availableDates
                                                                    .data[0],
                                                        )}
                                                        max={formatDateForInput(
                                                            availableDates
                                                                .data[1],
                                                        )}
                                                        onChange={(e) =>
                                                            setEndDate(
                                                                new Date(
                                                                    e.target.value,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                )}
                                <div className="mt-4">
                                    <label className="text-gray-400">
                                        <span className="text-gray-400 text-xl">
                                            Select an area
                                        </span>
                                        <button
                                            type="button"
                                            className="bg-blue-500 text-white p-2 rounded-md mt-2 w-full"
                                            onClick={() =>
                                                setIsSelectingArea(
                                                    !isSelectingArea,
                                                )
                                            }
                                        >
                                            {isSelectingArea
                                                ? 'Finish selecting area'
                                                : 'Select area to subset'}
                                        </button>
                                    </label>
                                    <div className="mt-2 flex flex-row items-center">
                                        <span
                                            className={`${selectedArea ? 'text-black' : 'text-gray-400'}`}
                                        >
                                            {selectedArea
                                                ? 'Area selected!'
                                                : 'No area selected'}
                                        </span>
                                        { selectedArea && (
                                        <button
                                            type="button"
                                            className="text-blue-400 p-2 rounded-md underline"
                                            onClick={() => setSelectedArea(undefined)}
                                        >
                                            Clear
                                        </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {selectedDatasetUrl && (
                            <div className="mt-8 flex flex-col overflow-clip">
                                <div className="pt-2 pb-3">
                                    <h3 className="font-bold text-xl">
                                        Selected Dataset
                                    </h3>
                                    <p className='font-bold text-gray-500'>{datasetIds.data?.[selectedDataset!]}</p>
                                    <p className="text-gray-400">
                                        Dataset Size:{' '}
                                        {`${selectedDatasetSize.data?.size.toFixed(0) ?? 'unknown'} ${selectedDatasetSize.data?.unit ?? ''}`}
                                    </p>
                                </div>
                                <CopyUrl
                                    key={selectedDatasetUrl}
                                    url={selectedDatasetUrl}
                                    text="View Dataset Info"
                                    linkTitle={true}
                                    disabled={false}
                                />
                                <CopyUrl
                                    key={selectedDatasetUrl + 'zarr/'}
                                    url={selectedDatasetUrl + 'zarr/'}
                                    text="Copy Zarr Dataset URL"
                                    linkTitle={false}
                                    disabled={false}
                                />
                                <CopyUrl
                                    key={`${selectedDatasetUrl}export/${datasetIds.data![selectedDataset!]}.nc`}
                                    url={`${selectedDatasetUrl}export/${datasetIds.data![selectedDataset!]}.nc`}
                                    text={
                                        selectedDatasetSize.data?.size &&
                                        selectedDatasetSize.data?.size <
                                            (exportThreshold.data ?? 500)
                                            ? 'Download as NetCDF'
                                            : `Dataset too large (> ${exportThreshold.data} MB) to download directly. Refine further to download as NetCDF.`
                                    }
                                    linkTitle={true}
                                    disabled={
                                        selectedDatasetSize.data?.size &&
                                        selectedDatasetSize.data?.size <
                                            (exportThreshold.data ?? 500)
                                            ? false
                                            : true
                                    }
                                />
                            </div>
                        )}
                    </form>
                </div>
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
        </div>
    );
}
