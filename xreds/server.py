import logging
import json

import cachey
import fsspec
import xarray as xr
import cf_xarray
import rioxarray
import xpublish
import fsspec

from fastapi import Depends
from xpublish.dependencies import get_cache

from .config import settings


logger = logging.getLogger("uvicorn")

gunicorn_logger = logging.getLogger('gunicorn.error')
logger.handlers = gunicorn_logger.handlers
if __name__ != "main":
    logger.setLevel(gunicorn_logger.level)
else:
    logger.setLevel(logging.DEBUG)


dataset_mapping = {}

def get_dataset(dataset_id: str, cache: cachey.Cache = Depends(get_cache)) -> xr.Dataset:
    cache_key = f"dataset-{dataset_id}"
    logger.info(cache.data.keys())
    ds = cache.get(cache_key)
    if not ds:
        logger.info(f'No dataset found in cache for {dataset_id}, loading...')

        dataset_spec = dataset_mapping[dataset_id]
        dataset_path = dataset_spec['path']

        if dataset_path.endswith('.nc'):
            ds = xr.open_dataset(dataset_path)
        elif '.zarr' in dataset_path:
            # TODO: Enable S3  support
            # mapper = fsspec.get_mapper(dataset_location)
            ds = xr.open_zarr(dataset_path, consolidated=True)
        elif dataset_path.endswith('.json'):
            if 'key' in dataset_spec:
                options = {'anon': False, 'use_ssl': False, 'key': dataset_spec['key'], 'secret': dataset_spec['secret']}
            else: 
                options = {'anon': True, 'use_ssl': False}
            fs = fsspec.filesystem("reference", fo=dataset_path, remote_protocol='s3', remote_options=options, target_options=options)
            m = fs.get_mapper("")
            ds = xr.open_dataset(m, engine="zarr", backend_kwargs=dict(consolidated=False), chunks={}, drop_variables='orderedSequenceData')
            
            if ds.cf.coords['longitude'].dims[0] == 'longitude':
                ds = ds.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby('longitude')
                # TODO: Yeah this should not be assumed... but for regular grids we will viz with rioxarray so for now we will assume
                ds = ds.rio.write_crs(4326)
        
        cache.put(cache_key, ds, 50)
        if dataset_id in cache.data.keys(): 
            logger.info(f'Loaded and cached dataset for {dataset_id}')
        else: 
            logger.info(f'Loaded dataset for {dataset_id}. Not cached due to size or current cache score')
        
    else: 
        logger.info(f'Using cached dataset for {dataset_id}')

    return ds


class DatasetServer(xpublish.Rest):
    def __init__(self, routers=None, cache_kws=None, app_kws=None):
        self._get_dataset_func = get_dataset

        global dataset_mapping
        if settings.datasets_mapping_file.startswith('s3'):
            fs = fsspec.filesystem('s3', anon=True)
        else:
            fs = fsspec.filesystem('file')
        with fs.open(settings.datasets_mapping_file, 'r') as f:
            dataset_mapping = json.load(f)
        self._datasets = list(dataset_mapping.keys())

        dataset_route_prefix = '/datasets/{dataset_id}'
        self._app_routers =xpublish.rest._set_app_routers(routers, dataset_route_prefix)

        self._app = None
        self._app_kws = {}
        if app_kws is not None:
            self._app_kws.update(app_kws)

        self._cache = None
        self._cache_kws = {'available_bytes': 4e9}
        if cache_kws is not None:
            self._cache_kws.update(cache_kws)
