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
                  queryKey: ['dataset', datasetId],
                  queryFn: () => fetchDataset(datasetId),
              }))
            : [],
    });

export const useDatasetMetadataQuery = (
    dataset:
        | {
              dataset: string;
              variable: string;
          }
        | undefined,
) =>
    useQuery({
        queryKey: ['dataset', 'metadata', dataset],
        queryFn: () =>
            dataset
                ? fetchMetadata(dataset.dataset, dataset.variable)
                : undefined,
        enabled: !!dataset,
    });

export const useDatasetMinMaxQuery = (dataset: {
    dataset: string;
    variable: string;
    date?: string;
    elevation?: string;
} | undefined) =>
    useQuery({
        queryKey: ['dataset', 'minmax', dataset],
        queryFn: () => dataset !== undefined ? fetchMinMax(
                dataset.dataset,
                dataset.variable,
                dataset.date,
                dataset.elevation,
            ) : undefined,
        enabled: !!dataset,
    });
