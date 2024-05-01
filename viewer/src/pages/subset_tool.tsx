import { useEffect, useRef, useState } from 'react';
import NavBar from '../components/nav';
import Sidebar from '../components/sidebar';
import Map from '../components/map';

import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import {
    useDatasetIdsQuery,
    useDatasetMetadataQuery,
    useDatasetsQuery,
} from '../query/datasets';
import Spinner from '../components/spinner';

export default function SubsetTool() {
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

    const datasetIds = useDatasetIdsQuery();
    const datasets = useDatasetsQuery(datasetIds.data);

    const [selectedDataset, setSelectedDataset] = useState<number | undefined>(
        undefined,
    );
    const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
    const [isSelectingArea, setIsSelectingArea] = useState(false);
    const [selectedArea, setSelectedArea] = useState<GeoJSON.Feature | null>(
        null,
    );

    function updateSelectedArea(e: any) {
        const data = draw.current.getAll();
        if (data.features.length === 0) {
            setSelectedArea(null);
            return;
        }

        setSelectedArea(data.features[0]);
    }

    useEffect(() => {
        if (!selectedDataset) {
            return;
        }

        setSelectedVariables([]);
    }, [selectedDataset]);

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

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
            <NavBar
                showSidebar={showSidebar}
                setSidebarShowing={setSidebarShowing}
            />
            <Sidebar showSidebar={showSidebar}>
                <div className="flex flex-col py-2">
                    <h1 className="text-2xl font-bold">Subset and Export</h1>

                    {datasetIds.isFetching && <Spinner />}

                    <form className="mt-4">
                        <label className="text-gray-500" htmlFor="dataset">
                            Select a dataset to subset
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

                        {selectedDataset &&
                            datasets.at(selectedDataset)?.data && (
                                <div>
                                    <div className="mt-4">
                                        <label className="text-gray-500">
                                            Select the variables from{' '}
                                            <b>
                                                {datasetIds.data?.at(
                                                    selectedDataset,
                                                )}
                                            </b>{' '}
                                            to include in subset
                                            <select
                                                className="w-full mt-2 h-64 border border-gray-300 text-black rounded-md"
                                                multiple={true}
                                                value={selectedVariables}
                                                onChange={(e) => {
                                                    const selected = Array.from(
                                                        e.target
                                                            .selectedOptions,
                                                    ).map((o) => o.value);

                                                    setSelectedVariables(
                                                        selected,
                                                    );
                                                }}
                                            >
                                                {Object.keys(
                                                    datasets.at(selectedDataset)
                                                        ?.data ?? {},
                                                ).map((v) => (
                                                    <option key={v} value={v}>
                                                        {v}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    <div className="mt-4">
                                        <label>
                                            Select the start and end date
                                            <div className="flex flex-col w-full">
                                                <div className='flex flex-row justify-between items-center mt-2'>
                                                    <label className='w-1/4 text-gray-400'>
                                                        Start date

                                                    </label>
                                                    <input
                                                        type="date"
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2"
                                                    />
                                                </div>
                                                <div className='flex flex-row justify-between items-center mt-2'>
                                                    <label className='w-1/4 text-gray-400'>
                                                        End date
                                                    </label>
                                                    <input
                                                        type="date"
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2"
                                                    />
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            className="bg-blue-500 text-white p-2 rounded-md w-full"
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
                                    </div>
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
