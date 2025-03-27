from typing import Optional

import xarray as xr
import zarr

from redis import Redis
from xreds.logging import logger


def infer_dataset_type(dataset_path: str) -> str:
    if dataset_path.endswith(".nc"):
        return "netcdf"
    elif dataset_path.endswith(".grib2"):
        return "grib2"
    elif dataset_path.endswith("json"):
        return "kerchunk"
    elif dataset_path.endswith(".zarr"):
        return "zarr"

    return "unknown"


def load_dataset(dataset_spec: dict) -> xr.Dataset | None:
    """Load a dataset from a path"""
    is_zarr_2 = zarr.__version__.strip().startswith("2")

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
    target_protocol = dataset_spec.get("target_protocol", "s3")
    target_options = dataset_spec.get("target_options", {"anon": True})
    remote_protocol = dataset_spec.get("remote_protocol", "s3")
    remote_options = dataset_spec.get("remote_options", {"anon": True})
    
    additional_coords = dataset_spec.get("additional_coords", None)
    additional_attrs = dataset_spec.get("additional_attrs", None)

    if dataset_type == "netcdf":
        ds = xr.open_dataset(
            dataset_path, 
            engine=dataset_spec.get("engine", "netcdf4"), 
            chunks=chunks, 
            drop_variables=drop_variables
        )
    elif dataset_type == "grib2":
        # TODO: Network support?
        ds = xr.open_dataset(
            dataset_path, 
            engine="cfgrib"
        )
    elif dataset_type == "kerchunk":
        ds = xr.open_dataset(
            dataset_path,
            engine="kerchunk",
            chunks=chunks,
            drop_variables=drop_variables,
            storage_options=dict(
                target_protocol=target_protocol,
                target_options=target_options,
                remote_protocol=remote_protocol, 
                remote_options=remote_options,
            ),
            open_dataset_options=dict(
                chunks=chunks
            )
        )
    elif dataset_type == "zarr":
        ds = xr.open_dataset(
            "reference://",
            engine="zarr",
            chunks=chunks,
            drop_variables=drop_variables,
            backend_kwargs=dict(
                consolidated=False,
                storage_options=dict(
                    fo=dataset_path,
                    target_protocol=target_protocol,
                    target_options=target_options,
                    remote_protocol=remote_protocol, 
                    remote_options={**remote_options, "asynchronous": not is_zarr_2},
                ),
            )
        )

    if ds is None:
        return None

    # Add additional attributes to the dataset if provided
    if additional_attrs is not None:
        ds.attrs.update(additional_attrs)

    # Add additional coordinates to the dataset if provided
    if additional_coords is not None:
        ds = ds.set_coords(additional_coords)
    
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
