import { useQueries, useQuery } from '@tanstack/react-query';
import {
    fetchDataset,
    fetchDatasetIds,
    fetchMetadata,
    fetchMinMax,
} from '../dataset';

export const useDatasetIdsQuery = () =>
    useQuery({ queryKey: ['datasets'], queryFn: fetchDatasetIds });

export const useDatasetsQuery = (datasetIds: Array<string> | undefined) =>
    useQueries({
        queries: datasetIds
            ? datasetIds.map((datasetId) => ({
                    refetchOnWindowFocus: false,
                    queryKey: ['dataset', datasetId],
                    staleTime: 10 * 60 * 1000,
                    queryFn: () => fetchDataset(datasetId),
              }))
            : [],
    });

export const useDatasetMetadataQuery = (
    dataset:
        | {
              dataset: string;
              variables: Set<string>;
          }
        | undefined,
) =>
    useQuery({
        refetchOnWindowFocus: false,
        queryKey: ['dataset', 'metadata', dataset?.dataset, dataset?.variables.values().toArray()],
        staleTime: 10 * 60 * 1000,
        queryFn: async () => dataset &&
            Object.fromEntries(await Promise.all(dataset.variables.keys().map(async (variable) => [
                variable,
                await fetchMetadata(dataset.dataset, variable),
            ]))),
        enabled: !!dataset,
    });

export const useDatasetMinMaxQuery = (dataset: {
    dataset: string;
    variable: string;
    date?: string;
    elevation?: string;
} | undefined) =>
    useQuery({
        refetchOnWindowFocus: false,
        queryKey: ['dataset', 'minmax', dataset],
        staleTime: 10 * 60 * 1000,
        queryFn: () => dataset !== undefined ? fetchMinMax(
                dataset.dataset,
                dataset.variable,
                dataset.date,
                dataset.elevation,
            ) : undefined,
        enabled: !!dataset,
    });
