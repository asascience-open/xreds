import json
import datetime

import fsspec
import xarray as xr

from xpublish import Plugin, hookimpl

from xreds.logging import logger
from xreds.config import settings
from xreds.utils import load_dataset


class DatasetProvider(Plugin):
    name: str = 'xreds_datasets'
    dataset_mapping: dict = {}
    datasets: dict = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        if settings.datasets_mapping_file.startswith('s3'):
            fs = fsspec.filesystem('s3', anon=True)
        else:
            fs = fsspec.filesystem('file')

        with fs.open(settings.datasets_mapping_file, 'r') as f:
            self.dataset_mapping = json.load(f)

    @hookimpl
    def get_datasets(self):
        return self.dataset_mapping.keys()

    @hookimpl
    def get_dataset(self, dataset_id: str) -> xr.Dataset:
        cache_key = f"dataset-{dataset_id}"

        cached_ds = self.datasets.get(cache_key, None)
        if cached_ds:
            if (datetime.datetime.now() - cached_ds['date']).seconds < (10 * 60):
                logger.info(f'Using cached dataset for {dataset_id}')
                return cached_ds['dataset']
            else:
                logger.info(f'Cached dataset for {dataset_id} is stale, reloading...')
                self.datasets.pop(cache_key, None)
        else:
            logger.info(f'No dataset found in cache for {dataset_id}, loading...')

        dataset_spec = self.dataset_mapping[dataset_id]
        ds = load_dataset(dataset_spec)

        if ds is None:
            raise ValueError(f"Dataset {dataset_id} not found")

        self.datasets[cache_key] = {
            'dataset': ds,
            'date': datetime.datetime.now()
        }

        if cache_key in self.datasets:
            logger.info(f'Loaded and cached dataset for {dataset_id}')
        else:
            logger.info(f'Loaded dataset for {dataset_id}. Not cached due to size or current cache score')

        return ds
