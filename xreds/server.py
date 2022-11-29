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


logger = logging.getLogger("api")

gunicorn_logger = logging.getLogger('gunicorn.error')
logger.handlers = gunicorn_logger.handlers
if __name__ != "main":
    logger.setLevel(gunicorn_logger.level)
else:
    logger.setLevel(logging.DEBUG)


dataset_mapping = {}

def get_dataset(dataset_id: str, cache: cachey.Cache = Depends(get_cache)) -> xr.Dataset:
    cache_key = f"dataset-{dataset_id}"
    ds = cache.get(cache_key)
    if not ds:
        dataset_location: str = dataset_mapping[dataset_id]

        if dataset_location.endswith('.nc'):
            ds = xr.open_dataset(dataset_location)
        elif '.zarr' in dataset_location:
            # TODO: Enable S3  support
            # mapper = fsspec.get_mapper(dataset_location)
            ds = xr.open_zarr(dataset_location, consolidated=True)
        elif dataset_location.endswith('.json'): 
            fs = fsspec.filesystem("reference", fo=dataset_location, remote_protocol='s3', remote_options={'anon':True, 'use_ssl': False})
            m = fs.get_mapper("")
            ds = xr.open_dataset(m, engine="zarr", backend_kwargs=dict(consolidated=False), chunks={'valid_time':1}, drop_variables='orderedSequenceData')
            ds = ds.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby('longitude')
        ds = ds.rio.write_crs(4326)
    return ds


class DatasetServer(xpublish.Rest):
    def __init__(self, routers=None, cache_kws=None, app_kws=None):
        self._get_dataset_func = get_dataset

        global dataset_mapping
        with open(settings.datasets_mapping_file, 'r') as f:
            dataset_mapping = json.load(f)
        self._datasets = list(dataset_mapping.keys())

        dataset_route_prefix = '/datasets/{dataset_id}'
        self._app_routers =xpublish.rest._set_app_routers(routers, dataset_route_prefix)

        self._app = None
        self._app_kws = {}
        if app_kws is not None:
            self._app_kws.update(app_kws)

        self._cache = None
        self._cache_kws = {'available_bytes': 1e6}
        if cache_kws is not None:
            self._cache_kws.update(cache_kws)
