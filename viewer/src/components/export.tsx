import { useEffect, useRef, useState, MutableRefObject } from 'react';
import NavBar from '../components/nav';
import Sidebar from '../components/sidebar';
import Map from '../components/map';

import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import MaterialIcon from '../components/material_icon';
import Spinner from '../components/spinner';
import { useQuery } from '@tanstack/react-query';
import CopyLink from '../components/copy_link';
import { useSearchParams } from 'react-router-dom';
import { useDatasetIdsQuery } from '../query/datasets';

const useExportThreshold = () =>
    useQuery({
        refetchOnWindowFocus: false,
        queryKey: ['export_threshold'],
        queryFn: async () => {
            const response = await fetch('/export/threshold');
            const { threshold } = await response.json();
            return threshold as number;
        },
    });

const useDatasetAvailableDates = (datasetId: string | undefined) =>
    useQuery({
        refetchOnWindowFocus: false,
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
        refetchOnWindowFocus: false,
        queryKey: ['dataset_size', url],
        queryFn: async (): Promise<
            { size: number; unit: string } | undefined
        > => {
            if (!url) {
                return undefined;
            }

            const response = await fetch(`${url}size/`);
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

const Export = ({ map, dataset }: { map: MutableRefObject<maplibregl.Map | null>; dataset: string }) => {
    const exportThreshold = useExportThreshold();
    const datasetIds = useDatasetIdsQuery();

    const draw = useRef<MapboxDraw>(
        new MapboxDraw({
            displayControlsDefault: false,
            defaultMode: 'draw_polygon',
        }),
    );

    const [selectedDataset, setSelectedDataset] = useState<number | undefined>(undefined);
    const availableDates = useDatasetAvailableDates(
        selectedDataset !== undefined ? datasetIds.data?.at(selectedDataset) : undefined,
    );
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [isSelectingArea, setIsSelectingArea] = useState(false);
    const [selectedArea, setSelectedArea] = useState<GeoJSON.Feature | undefined>(undefined);
    const [selectedDatasetUrl, setSelectedDatasetUrl] = useState<string | undefined>(undefined);
    const [selectedDatasetUrlCopied, setSelectedDatasetUrlCopied] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [downloadError, setDownloadError] = useState<string | undefined>(undefined);

    const selectedDatasetSize = useSelectedDatasetSize(selectedDatasetUrl);
    const allowDatasetDownload = selectedDatasetSize.data?.size && selectedDatasetSize.data?.size < (exportThreshold.data ?? 500);

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
        setIsSelectingArea(false);
        setIsDownloading(false);
        setDownloadError(undefined);
    }, [selectedDataset]);

    useEffect(() => {
        const queriedDataset = dataset;
        if (!queriedDataset) {
            return;
        }

        const datasetId = datasetIds.data?.findIndex((id) => id === queriedDataset);
        if (datasetId === -1) {
            return;
        }

        setSelectedDataset(datasetId);
    }, [datasetIds.data, dataset]);

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
        setDownloadError(undefined);
        setIsDownloading(false);
        if (selectedDataset === undefined || !datasetIds.data) {
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
        <div className="flex flex-col py-2">
            <h1 className="text-2xl font-bold">Subset and Export</h1>

            {datasetIds.isLoading && (
                <div className='w-full flex flex-row justify-center'>
                    <Spinner />
                </div>
            )}
            {!datasetIds.isLoading && datasetIds.isError && (
                <div className="flex flex-row justify-around items-center">
                    <span className="text-red-500">An error occurred</span>
                    <button
                        type="button"
                        className="bg-red-500 text-white rounded-md py-[0.25rem] px-[0.5rem] hover:cursor-pointer"
                        onClick={() => datasetIds.refetch()}
                    >
                        <MaterialIcon
                            className="mr-1 mt-[-2px] self-center align-middle"
                            name="cached"
                        />
                        Retry
                    </button>
                </div>
            )}
            {!datasetIds.isError && datasetIds.data && (
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

                    {selectedDataset !== undefined && (
                        <div className="mt-4">
                            {availableDates.isLoading && (
                                <div className='w-full flex flex-row justify-center py-3'>
                                    <Spinner />
                                </div>
                            )}
                            {!availableDates.isLoading && availableDates.isError && (
                                <div className="flex flex-row justify-around items-center">
                                    <span className="text-red-500">An error occurred</span>
                                    <button
                                        type="button"
                                        className="bg-red-500 text-white rounded-md py-[0.25rem] px-[0.5rem] hover:cursor-pointer"
                                        onClick={() => availableDates.refetch()}
                                    >
                                        <MaterialIcon
                                            className="mr-1 mt-[-2px] self-center align-middle"
                                            name="cached"
                                        />
                                        Retry
                                    </button>
                                </div>
                            )}
                            {!availableDates.isError && availableDates.data && (
                                <>
                                    <div className="mt-4">
                                        <label>
                                            <style>{`
                                                input::-webkit-calendar-picker-indicator {
                                                    cursor: pointer;
                                                }
                                            `}</style>
                                            <div className="flex flex-row justify-between items-center">
                                                <span className="text-gray-400 text-xl">
                                                    Select the start and end date
                                                </span>
                                                <div 
                                                    className={`underline ${startDate !== undefined || endDate !== undefined 
                                                        ? 'text-blue-500 cursor-pointer' : 'text-gray-200 cursor-not-allowed'}`} 
                                                    onClick={() => {
                                                        setStartDate(undefined);
                                                        setEndDate(undefined);
                                                    }}
                                                >
                                                    Clear
                                                </div>
                                            </div>
                                            <div className="flex flex-col w-full">
                                                <div className="flex flex-row justify-between items-center mt-2">
                                                    <label className="w-1/4 text-gray-400">
                                                        Start date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2 hover:cursor-pointer"
                                                        value={startDate !== undefined ? formatDateForInput(startDate) : ''}
                                                        min={formatDateForInput(availableDates.data[0])}
                                                        max={formatDateForInput(endDate ?? availableDates.data[1])}
                                                        onChange={(e) => setStartDate(new Date(e.target.value))}
                                                    />
                                                </div>
                                                <div className="flex flex-row justify-between items-center mt-2">
                                                    <label className="w-1/4 text-gray-400">
                                                        End date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        className="p-2 flex-1 ml-4 border border-gray-300 text-black rounded-md w-1/2 hover:cursor-pointer"
                                                        value={endDate !== undefined ? formatDateForInput(endDate) : ''}
                                                        min={formatDateForInput(startDate ?? availableDates.data[0])}
                                                        max={formatDateForInput(availableDates.data[1])}
                                                        onChange={(e) => setEndDate(new Date(e.target.value))}
                                                    />
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="mt-4">
                                        <label className="text-gray-400">
                                            <div className="flex flex-row justify-between items-center">
                                                <span className="text-gray-400 text-xl">
                                                    Select an area
                                                </span>
                                                <div 
                                                    className={`underline ${selectedArea !== undefined 
                                                        ? 'text-blue-500 cursor-pointer' : 'text-gray-200 cursor-not-allowed'}`} 
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setIsSelectingArea(false);
                                                        setSelectedArea(undefined);
                                                    }}
                                                >
                                                    Clear
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="border border-gray-300 p-2 rounded-md mt-2 w-full hover:cursor-pointer text-black"
                                                onClick={(e) => {
                                                    if (e.isDefaultPrevented()) {
                                                        return;
                                                    }

                                                    setIsSelectingArea(!isSelectingArea)
                                                }}
                                            >
                                                {isSelectingArea ? 'Finish selecting area' : 'Select area to subset'}
                                            </button>
                                        </label>
                                        <div className="mt-2 flex flex-row items-center">
                                            <span
                                                className={`${selectedArea ? 'text-black' : 'text-gray-400'}`}
                                            >
                                                {selectedArea ? 'Area selected!' : 'No area selected - defaulting to full dataset extents'}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {selectedDatasetUrl && (
                        <div className="mt-8 flex flex-col overflow-clip">
                            <h3 className="font-bold text-xl">
                                Selected Dataset
                            </h3>
                            <div className="w-full flex flex-row flex-wrap justify-between items-center py-2">
                                <CopyLink
                                    key={selectedDatasetUrl + 'zarr/'}
                                    url={selectedDatasetUrl + 'zarr/'}
                                    text="Copy Zarr Dataset URL"
                                    linkTitle={false}
                                    disabled={false}
                                    origin_path={'subset_export'}
                                />
                                <a
                                    href={selectedDatasetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="cursor-pointer text-blue-500 underline"
                                >
                                    View Dataset Info
                                </a> 
                            </div>
                            <div 
                                className={`flex flex-row w-full justify-center items-center text-white p-2 rounded-md 
                                    ${allowDatasetDownload && !isDownloading ? 'bg-blue-500 hover:cursor-pointer' : 'bg-gray-200 hover:cursor-not-allowed'}`}
                                onClick={async (e) => {
                                    if (selectedDataset === undefined || !allowDatasetDownload || isDownloading || e.isDefaultPrevented()) {
                                        return;
                                    }
                                    if (e.detail > 1) {
                                        e.preventDefault();
                                    }

                                    setDownloadError(undefined);
                                    setIsDownloading(true);
                                    try {
                                        const datasetId = datasetIds.data![selectedDataset!];
                                        const response = await fetch(`${selectedDatasetUrl}export/${datasetId}.nc`);
                                        if (response.status !== 200) {
                                            throw new Error(await response.text());
                                        }

                                        const dataBlob = await response.blob();
                                        const link = document.createElement('a');
                                        link.href = URL.createObjectURL(new Blob([dataBlob]));
                                        link.setAttribute('download', `${datasetId}.nc`);

                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                    }
                                    catch (e) {
                                        console.error(e);
                                        setDownloadError(`${e}`);
                                    }

                                    setIsDownloading(false);
                                }}
                            >
                                <div 
                                    className={`block leading-[0] mr-4 ${allowDatasetDownload ? 'hover:cursor-pointer' : 'hover:cursor-not-allowed'}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (!allowDatasetDownload) {
                                            return;
                                        }

                                        const host = window.location.protocol + '//' +  window.location.host;
                                        let path = window.location.pathname.split('subset_export')[0]
                                        if (path.includes(import.meta.env.VITE_XREDS_BASE_URL)) {
                                            path = path.replace(import.meta.env.VITE_XREDS_BASE_URL, '');
                                        }
                                        if (path.endsWith('/')) {
                                            path = path.slice(0, -1);
                                        }

                                        const copy_url = `${host}${path}${selectedDatasetUrl}export/${datasetIds.data![selectedDataset!]}.nc`;
                                        window.navigator.clipboard.writeText(`${copy_url}`);
                                        setSelectedDatasetUrlCopied(true);
                                    }}
                                >
                                    <MaterialIcon name={selectedDatasetUrlCopied ? 'check' : 'content_copy'} />
                                </div>
                                {!isDownloading 
                                    ? `Download NetCDF (${selectedDatasetSize.isLoading 
                                        ? 'Loading size...' 
                                        : (selectedDatasetSize.data?.size?.toFixed(0) ?? 'Unknown Size')}${selectedDatasetSize.data?.unit ? ` ${selectedDatasetSize.data.unit}` : ''})`
                                    : `Downloading, Please Wait...`}
                            </div>
                            {!allowDatasetDownload && (
                                <div className="w-full text-red-500 pt-2">
                                    {`Dataset too large (> ${exportThreshold.data} MB) to download directly. Refine further to download as NetCDF.`}
                                </div>
                            )}
                            {downloadError && (
                                <div className="w-full text-red-500 pt-2">
                                    {`Download Error: ${downloadError}`}
                                </div>
                            )}
                        </div>
                    )}
                </form>
            )}
        </div>
    )
}

export default Export;