import json
import datetime

import fsspec
import xarray as xr

from xpublish import Plugin, hookimpl

from xreds.logging import logger
from xreds.config import settings


def load_dataset(dataset_spec: dict) -> xr.Dataset | None:
    """Load a dataset from a path"""
    ds = None
    dataset_path = dataset_spec['path']
    dataset_type = dataset_spec["type"]
    chunks = dataset_spec.get('chunks', None)
    drop_variables = dataset_spec.get('drop_variables', None)
    additional_coords = dataset_spec.get('additional_coords', None)
    key = dataset_spec.get('key', None)
    secret = dataset_spec.get('secret', None)

    if dataset_type == 'netcdf':
        ds = xr.open_dataset(dataset_path, engine='netcdf4', chunks=chunks, drop_variables=drop_variables)
        if additional_coords is not None:
            ds = ds.set_coords(additional_coords)
    elif dataset_type == 'grib2':
        ds = xr.open_dataset(dataset_path, engine='cfgrib')
    elif dataset_type == 'kerchunk':
        if key is not None:
            options = {'anon': False, 'key': key, 'secret': secret}
        else:
            options = {'anon': True}
        fs = fsspec.filesystem(
            "filecache",
            expiry_time=10 * 60, # TODO: Make this driven by config per dataset, for now default to 10 minutes
            target_protocol='reference',
            target_options={
                'fo': dataset_path,
                'target_protocol': 's3',
                'target_options': options,
                'remote_protocol': 's3',
                'remote_options': options,
            })
        m = fs.get_mapper("")
        ds = xr.open_dataset(m, engine="zarr", backend_kwargs=dict(consolidated=False), chunks=chunks, drop_variables=drop_variables)
        try:
            if ds.cf.coords['longitude'].dims[0] == 'longitude':
                ds = ds.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby('longitude')
                # TODO: Yeah this should not be assumed... but for regular grids we will viz with rioxarray so for now we will assume
                ds = ds.rio.write_crs(4326)
        except Exception as e:
            logger.warning(f'Could not reindex longitude: {e}')
            pass
    elif dataset_type == 'zarr':
        # TODO: Enable S3  support
        # mapper = fsspec.get_mapper(dataset_location)
        ds = xr.open_zarr(dataset_path, consolidated=True)

    return ds


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

        # Check if we have a time dimension and if it is not indexed, index it
        try:
            time_dim = ds.cf['time'].dims[0]
            if not ds.indexes.get(time_dim, None):
                time_coord = ds.cf['time'].name
                logger.info(f'Indexing time dimension {time_dim} as {time_coord}')
                ds = ds.set_index({time_dim: time_coord})
                if 'standard_name' not in ds[time_dim].attrs:
                    ds[time_dim].attrs['standard_name'] = 'time'
        except Exception as e:
            logger.warning(f'Could not index time dimension: {e}')
            pass

        self.datasets[cache_key] = {
            'dataset': ds,
            'date': datetime.datetime.now()
        }

        if cache_key in self.datasets:
            logger.info(f'Loaded and cached dataset for {dataset_id}')
        else:
            logger.info(f'Loaded dataset for {dataset_id}. Not cached due to size or current cache score')

        return ds
