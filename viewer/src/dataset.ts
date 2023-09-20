import { xmlToJSON } from "./tools";


export interface DatasetLayer {
    name: string,
    title: string,
    units?: string,
    bbox: [number, number, number, number],
    times?: string[],
    defaultTime?: string,
    elevations?: string[],
    defaultElevation?: string,
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

export async function fetchDataset(id: string): Promise<{ [k: string]: DatasetLayer }> {
    const layers = await fetchDatasetCapabilities(id);
    let datasetLayers: { [k: string]: DatasetLayer } = {};

    layers.forEach((l: any) => {
        let times: string[] | undefined = undefined;
        let defaultTime: string | undefined = undefined;
        let elevations: string[] | undefined = undefined;
        let defaultElevation: string | undefined = undefined;

        if (Array.isArray(l.Dimension)) {
            const timeDimension = l.Dimension.find((d: any) => d['@_name'] == 'time');
            times = timeDimension?.['#text'].split(',');
            defaultTime = timeDimension?.['@_default'];

            const elevationDimension = l.Dimension.find((d: any) => d['@_name'] == 'elevation');
            elevations = elevationDimension?.['#text'].split(',');
            defaultElevation = elevationDimension?.['@_default'];
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
            bbox,
            times,
            defaultTime,
            elevations,
            defaultElevation,
        };
    });

    return datasetLayers;
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
            let elevations: string[] | undefined = undefined;
            let defaultElevation: string | undefined = undefined;

            if (Array.isArray(l.Dimension)) {
                const timeDimension = l.Dimension.find((d: any) => d['@_name'] == 'time');
                times = timeDimension?.['#text'].split(',');
                defaultTime = timeDimension?.['@_default'];

                const elevationDimension = l.Dimension.find((d: any) => d['@_name'] == 'elevation');
                elevations = elevationDimension?.['#text'].split(',');
                defaultElevation = elevationDimension?.['@_default'];
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
                bbox,
                times,
                defaultTime,
                elevations,
                defaultElevation,
            };
        });
        datasetsRecord[datasetIds[i]] = datasetLayers;
    });

    return datasetsRecord;
}

export async function fetchMinMax(dataset: string, variable: string, date?: string): Promise<{ min: number, max: number }> {
    let url = `/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&version=1.3.0&item=minmax&layers=${variable}`;
    if (date) {
        url += `&time=${date}`;
    }
    const response = await fetch(`/datasets/${dataset}/wms/?service=WMS&request=GetMetadata&version=1.3.0&item=minmax&layers=${variable}`);
    const metadata = await response.json();
    return metadata;
}