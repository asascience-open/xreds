import logging
import json
import datetime
from enum import Enum

import cachey
import fsspec
from pydantic import Field
import xarray as xr
import fsspec

from fastapi import Depends
from xpublish.dependencies import get_cache
from xpublish import Plugin, hookimpl

from .config import settings


logger = logging.getLogger("uvicorn")

gunicorn_logger = logging.getLogger('gunicorn.error')
logger.handlers = gunicorn_logger.handlers
if __name__ != "main":
    logger.setLevel(gunicorn_logger.level)
else:
    logger.setLevel(logging.DEBUG)


class DatasetProvider(Plugin):
    name = 'xreds_datasets'
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

        #ds = cache.get(cache_key)

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
        dataset_path = dataset_spec['path']
        dataset_type = dataset_spec["type"]

        if dataset_type == 'netcdf':
            ds = xr.open_dataset(dataset_path)
        elif dataset_type == 'kerchunk':
            if 'key' in dataset_spec:
                options = {'anon': False, 'use_ssl': False, 'key': dataset_spec['key'], 'secret': dataset_spec['secret']}
            else: 
                options = {'anon': True, 'use_ssl': False}
            fs = fsspec.filesystem("reference", fo=dataset_path, remote_protocol='s3', remote_options=options, target_options=options)
            m = fs.get_mapper("")
            ds = xr.open_dataset(m, engine="zarr", backend_kwargs=dict(consolidated=False), chunks=dataset_spec['chunks'], drop_variables=dataset_spec['drop_variables'])

            try:
                if ds.cf.coords['longitude'].dims[0] == 'longitude':
                    ds = ds.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby('longitude')
                    # TODO: Yeah this should not be assumed... but for regular grids we will viz with rioxarray so for now we will assume
                    ds = ds.rio.write_crs(4326)
            except:
                pass
        elif dataset_type == 'zarr':
            # TODO: Enable S3  support
            # mapper = fsspec.get_mapper(dataset_location)
            ds = xr.open_zarr(dataset_path, consolidated=True)

        self.datasets[cache_key] = {
            'dataset': ds,
            'date': datetime.datetime.now()
        }

        #cache.put(cache_key, ds, 50)
        if cache_key in self.datasets: 
            logger.info(f'Loaded and cached dataset for {dataset_id}')
        else: 
            logger.info(f'Loaded dataset for {dataset_id}. Not cached due to size or current cache score')

        return ds
