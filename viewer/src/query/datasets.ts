import {
    DefinedQueryObserverResult,
    useQueries,
    useQuery,
} from '@tanstack/react-query';
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
