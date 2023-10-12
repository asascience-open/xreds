import { xmlToJSON } from "./tools";


export interface DatasetLayer {
    name: string,
    title: string,
    units?: string,
    bbox: [number, number, number, number],
    times?: string[],
    defaultTime?: string,
    elevations?: number[],
    defaultElevation?: number,
}

export interface DatasetMenuItem {
    id: string,
    label: string,
    plottable: boolean,
    children?: DatasetMenuItem[]
}

export async function fetchDatasetIds(): Promise<string[]> {
    const response = await fetch('/datasets');
    const datasets = await response.json();
    return datasets;
}

export async function fetchDatasetCapabilities(dataset: string): Promise<any> {
    const response = await fetch(`/datasets/${dataset}/wms/?service=WMS&request=GetCapabilities&version=1.3.0`);
    const rawCapabilities = await response.text();
    const capabilities = xmlToJSON(rawCapabilities).WMS_Capabilities.Capability.Layer.Layer;
    return capabilities;
}

export async function fetchDatasetInfo(dataset: string): Promise<any> {
    const response = await fetch(`/datasets/${dataset}/info`);
    return await response.json();
}

export async function fetchDatasetMenu(dataset: string): Promise<any> {
    const response = await fetch(`/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&item=menu`);
    return await response.json();
}

export async function fetchDataset(id: string): Promise<{ [k: string]: string }> {
    try {
        const layers = await fetchDatasetMenu(id);

        return layers["children"].reduce((obj: { [k: string]: string }, c: DatasetMenuItem) => {
            // TODO - support grouped layers?
            if (c["plottable"]) {
                obj[c["id"]] = c["label"];
            }
            
            return obj;
        }, {});
    }
    catch (e) {
        console.error(e);
        return {}
    }
}

export async function fetchDatasets(): Promise<{ [k: string]: any }> {
    const datasetIds = await fetchDatasetIds();
    const promises = datasetIds.map(did => fetchDatasetCapabilities(did));
    const datasets = await Promise.all(promises);

    const datasetsRecord: { [k: string]: { [j: string]: DatasetLayer } } = {};
    datasets.forEach((d, i) => {
        const datasetLayers: { [k: string]: DatasetLayer } = {}
        d.forEach((l: any) => {
            let times: string[] | undefined = undefined;
            let defaultTime: string | undefined = undefined;
            let elevations: number[] | undefined = undefined;
            let defaultElevation: number | undefined = undefined;

            if (Array.isArray(l.Dimension)) {
                const timeDimension = l.Dimension.find((d: any) => d['@_name'] == 'time');
                times = timeDimension?.['#text'].split(',');
                defaultTime = timeDimension?.['@_default'];

                const elevationDimension = l.Dimension.find((d: any) => d['@_name'] == 'elevation');
                elevations = elevationDimension?.['#text'].split(',').map((e: string) => parseFloat(e));
                defaultElevation = parseFloat(elevationDimension?.['@_default']);
            } else {
                if (l.Dimension['@_name'] == 'time') {
                    times = l.Dimension['#text'].split(',');
                    defaultTime = l.Dimension['@_default'];
                } else if (l.Dimension['@_name'] == 'elevation') {
                    elevations = l.Dimension['#text'].split(',');
                    defaultElevation = l.Dimension['@_default'];
                }
            }

            const bbox: [number, number, number, number] = [l.BoundingBox["@_minx"], l.BoundingBox["@_miny"], l.BoundingBox["@_maxx"], l.BoundingBox["@_maxy"]];

            datasetLayers[l.Name] = {
                name: l.Name,
                title: l.Title,
                units: l.Units,
                bbox: bbox,
                times: times,
                defaultTime: defaultTime,
                elevations: (elevations?.find((e: number) => isNaN(e))) ? undefined : elevations,
                defaultElevation: (defaultElevation === undefined || isNaN(defaultElevation)) ? undefined : defaultElevation,
            };
        });
        datasetsRecord[datasetIds[i]] = datasetLayers;
    });

    return datasetsRecord;
}

export async function fetchMetadata(dataset: string, variable: string): Promise<DatasetLayer> {
    const response = await fetch(`/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&version=1.3.0&item=layerDetails&layerName=${variable}`);
    const rawMetadata = await response.json();
    
    let closestTime: string | undefined;
    let closestTimeDiff: number = Infinity;
    
    if (rawMetadata["timesteps"] && rawMetadata["timesteps"].length > 0) {
        const now = new Date().getTime();
        rawMetadata["timesteps"].forEach((t: string) => {
            const currDate = new Date(t);
            const currDiff = now - currDate.getTime();
            if (currDiff > 0 && currDiff < closestTimeDiff) {
                closestTime = t;
                closestTimeDiff = currDiff;
            }
        });
    }

    let closestElevation: number | undefined;
    let closestElevationDiff: number = Infinity;
    if (rawMetadata["elevation"] && rawMetadata["elevation"].length > 0) {
        rawMetadata["elevation"].forEach((e: number) => {
            if (Math.abs(e) < closestElevationDiff) {
                closestElevation = e;
                closestElevationDiff = Math.abs(e);
            }
        });
    }
    
    return {
        name: rawMetadata["layerName"],
        title: rawMetadata["long_name"],
        units: rawMetadata["units"],
        bbox: rawMetadata["bbox"],
        times: rawMetadata["timesteps"],
        defaultTime: closestTime,
        elevations: rawMetadata["elevation"]?.sort(),
        defaultElevation: closestElevation
    };
}

export async function fetchMinMax(dataset: string, variable: string, date?: string, elevation?: string): Promise<{ min: number, max: number }> {
    let result;
    try {
        let url = `/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&version=1.3.0&item=minmax&layers=${variable}`;
        if (date) {
            url += `&time=${date}`;
        }
        if (elevation) {
            url += `&elevation=${elevation}`;
        }
        
        const response = await fetch(url);
        result = await response.json();
    }
    catch (e) {
        console.error(e);
        console.log(`Failed to fetch MinMax with timestep of ${date} & elevation of ${elevation}`);

        const response = await fetch(`/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&version=1.3.0&item=minmax&layers=${variable}`);
        result = await response.json();
    }
    
    return result;
}