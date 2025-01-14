import pickle
from typing import Optional

import fsspec
import ujson
import xarray as xr
from redis_fsspec_cache.reference import RedisCachingReferenceFileSystem

from redis import Redis
from xreds.logging import logger

ZARR_CACHE_KEY_PREFIX = "zarr_dataset"


def _get_cache_key(dataset_path: str, key_prefix: str) -> str:
    return f"{key_prefix}:{dataset_path}"


def _load_zarr_dataset_from_path(
    dataset_path: str,
    chunks: dict | None = None,
    drop_variables: list[str] | None = None,
) -> xr.Dataset:
    return xr.open_zarr(
        dataset_path,
        consolidated=True,
        chunks=chunks,
        drop_variables=drop_variables,
    )


def _retrieve_cached_dataset(redis_cache: Redis, cache_key: str) -> xr.Dataset | None:
    cached_ds = redis_cache.get(cache_key)
    # If found in cache, deserialize and return
    if cached_ds is not None:
        return pickle.loads(cached_ds)

    return None


def _load_netcdf(
    dataset_path: str,
    engine: str,
    chunks: dict | None = None,
    drop_variables: list[str] | None = None,
    additional_coords: list[str] | None = None,
) -> xr.Dataset:
    ds = xr.open_dataset(
        dataset_path, engine=engine, chunks=chunks, drop_variables=drop_variables
    )

    if additional_coords is not None:
        ds = ds.set_coords(additional_coords)

    return ds


def _load_grib2(dataset_path: str) -> xr.Dataset:
    # TODO: Network support?
    return xr.open_dataset(dataset_path, engine="cfgrib")


def _load_kerchunk(
    dataset_spec: dict,
    dataset_path: str,
    chunks: dict | None = None,
    drop_variables: list[str] | None = None,
    redis_cache: Optional[Redis] = None,
    cache_timeout: int = 600,
) -> xr.Dataset:
    target_protocol = dataset_spec.get("target_protocol", "s3")
    target_options = dataset_spec.get("target_options", {"anon": True})
    remote_protocol = dataset_spec.get("remote_protocol", "s3")
    remote_options = dataset_spec.get("remote_options", {"anon": True})

    if redis_cache is not None:
        reference_url = f"rediscache::{dataset_path}"
        with fsspec.open(
            reference_url,
            mode="rb",
            rediscache={"redis": redis_cache, "expiry": cache_timeout},
            s3=target_options,
        ) as f:
            refs = ujson.load(f)
        fs = RedisCachingReferenceFileSystem(
            redis=redis_cache,
            expiry_time=cache_timeout,
            fo=dataset_path,
            target_protocol=target_protocol,
            target_options=target_options,
            remote_protocol=remote_protocol,
            remote_options=remote_options,
        )
    else:
        fs = fsspec.filesystem(
            "filecache",
            expiry_time=cache_timeout,
            target_protocol="reference",
            target_options={
                "fo": dataset_path,
                "target_protocol": target_protocol,
                "target_options": target_options,
                "remote_protocol": remote_protocol,
                "remote_options": remote_options,
            },
        )
    m = fs.get_mapper("")
    ds = xr.open_dataset(
        m,
        engine="zarr",
        backend_kwargs=dict(consolidated=False),
        chunks=chunks,
        drop_variables=drop_variables,
    )
    try:
        if ds.cf.coords["longitude"].dims[0] == "longitude":
            ds = ds.assign_coords(
                longitude=(((ds.longitude + 180) % 360) - 180)
            ).sortby("longitude")
            # TODO: Yeah this should not be assumed... but for regular grids we will viz with rioxarray so for now we will assume
            ds = ds.rio.write_crs(4326)
    except Exception as e:
        logger.warning(f"Could not reindex longitude: {e}")
        pass

    return ds


def _load_zarr(
    dataset_path: str,
    chunks: dict | None = None,
    drop_variables: list[str] | None = None,
    redis_cache: Optional[Redis] = None,
    cache_timeout: int = 600,
) -> xr.Dataset:
    if redis_cache is not None:
        # Create a unique key for the dataset
        cache_key = _get_cache_key(dataset_path, ZARR_CACHE_KEY_PREFIX)
        ds = _retrieve_cached_dataset(redis_cache, cache_key)
        if ds is not None:
            return ds

    # If Redis cache is not enabled, or not found in cache, load the dataset
    ds = _load_zarr_dataset_from_path(dataset_path, chunks, drop_variables)

    # If Redis cache is enabled, serialize and store the dataset in Redis cache
    if redis_cache is not None:
        cache_key = _get_cache_key(dataset_path, ZARR_CACHE_KEY_PREFIX)
        serialized_ds = pickle.dumps(ds, protocol=-1)
        redis_cache.set(cache_key, serialized_ds, ex=cache_timeout)

    # Return the dataset
    return ds


def infer_dataset_type(dataset_path: str) -> str:
    if dataset_path.endswith(".nc"):
        return "netcdf"
    elif dataset_path.endswith(".grib2"):
        return "grib2"
    elif dataset_path.endswith(".nc.zarr") or dataset_path.endswith("json"):
        return "kerchunk"
    elif dataset_path.endswith(".zarr"):
        return "zarr"

    return "unknown"


def load_dataset(
    dataset_spec: dict, redis_cache: Optional[Redis] = None, cache_timeout: int = 600
) -> xr.Dataset | None:
    """Load a dataset from a path"""
    ds = None
    dataset_path = dataset_spec["path"]
    dataset_type = dataset_spec.get("type", None)
    if not dataset_type:
        dataset_type = infer_dataset_type(dataset_path)
        logger.info(f"Inferred dataset type {dataset_type} for {dataset_path}")
    if dataset_type == "unknown":
        logger.error(f"Could not infer dataset type for {dataset_path}")
        return None

    chunks = dataset_spec.get("chunks", None)
    drop_variables = dataset_spec.get("drop_variables", None)
    additional_coords = dataset_spec.get("additional_coords", None)
    additional_attrs = dataset_spec.get("additional_attrs", None)

    if dataset_type == "netcdf":
        ds = _load_netcdf(
            dataset_path,
            engine=dataset_spec.get("engine", "netcdf4"),
            chunks=chunks,
            drop_variables=drop_variables,
            additional_coords=additional_coords,
        )
    elif dataset_type == "grib2":
        ds = _load_grib2(dataset_path)
    elif dataset_type == "kerchunk":
        ds = _load_kerchunk(
            dataset_spec,
            dataset_path,
            chunks=chunks,
            drop_variables=drop_variables,
            redis_cache=redis_cache,
            cache_timeout=cache_timeout,
        )
    elif dataset_type == "zarr":
        ds = _load_zarr(
            dataset_path,
            chunks=chunks,
            drop_variables=drop_variables,
            redis_cache=redis_cache,
            cache_timeout=cache_timeout,
        )

    if ds is None:
        return None

    # Add additional attributes to the dataset if provided
    if additional_attrs is not None:
        ds.attrs.update(additional_attrs)

    # Check if we have a time dimension and if it is not indexed, index it
    try:
        time_dim = ds.cf["time"].dims[0]
        if ds.indexes.get(time_dim, None) is None:
            time_coord = ds.cf["time"].name
            logger.info(f"Indexing time dimension {time_dim} as {time_coord}")
            ds = ds.set_index({time_dim: time_coord})
            if "standard_name" not in ds[time_dim].attrs:
                ds[time_dim].attrs["standard_name"] = "time"
    except Exception as e:
        logger.warning(f"Could not index time dimension: {e}")
        pass

    return ds
