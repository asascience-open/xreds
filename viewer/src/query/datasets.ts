import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchDataset, fetchDatasetIds } from '../dataset';

export const useDatasetIdsQuery = () =>
    useQuery({ queryKey: ['datasets'], queryFn: fetchDatasetIds });

export const useDatasetsQuery = (datasetIds: Array<string> | undefined) =>
    useQueries({
        queries: datasetIds
            ? datasetIds.map((datasetId) => ({
                  queryKey: ['dataset', datasetId],
                  queryFn: () => fetchDataset(datasetId),
              }))
            : [],
    });

export const useDatasets = (
    datasetIds: Array<string> | undefined,
): { [k: string]: any } => {
    const datasetsQuery = useDatasetsQuery(datasetIds);

    const datasets: { [k: string]: any } = {};
    datasetsQuery?.forEach((query, i) => {
        const datasetId = datasetIds?.[i];
        if (query.data && datasetId) {
            datasets[datasetId] = query.data;
        }
        return datasets;
    });

    return datasets;
};
