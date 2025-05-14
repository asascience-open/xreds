import os
from typing import Optional, Union

import icechunk
import xarray as xr
import zarr

from xreds.logging import logger

def load_dataset(dataset_spec: dict) -> xr.Dataset | None:
    """Load a dataset from a path"""
    ds = None
    dataset_path = dataset_spec["path"]
    dataset_type = dataset_spec.get("type", None)
    if not dataset_type:
        dataset_type = _infer_dataset_type(dataset_path)
        logger.info(f"Inferred dataset type {dataset_type} for {dataset_path}")
    if dataset_type == "unknown":
        logger.error(f"Could not infer dataset type for {dataset_path}")
        return None

    chunks = dataset_spec.get("chunks", None)
    drop_variables = dataset_spec.get("drop_variables", None)
    mask_variables = dataset_spec.get("mask_variables", None)

    storage_options = dataset_spec.get("storage_options", {})    
    additional_coords = dataset_spec.get("additional_coords", None)
    additional_attrs = dataset_spec.get("additional_attrs", None)

    if dataset_type == "netcdf":
        ds = _load_netcdf(
            dataset_path, 
            engine=dataset_spec.get("engine", "netcdf4"), 
            chunks=chunks, 
            drop_variables=drop_variables
        )
    elif dataset_type == "grib2":
        ds = _load_grib(
            dataset_path, 
            chunks=chunks, 
            drop_variables=drop_variables
        )
    elif dataset_type == "kerchunk":
        ds = _load_kerchunk(
            dataset_path,
            chunks=chunks,
            drop_variables=drop_variables,
            storage_options=storage_options
        )
    elif dataset_type == "zarr":
        ds = _load_zarr(
            dataset_path,
            chunks=chunks,
            drop_variables=drop_variables,
            storage_options=storage_options
        )
    elif dataset_type == "virtual-icechunk":
        ds = _load_virtual_icechunk(
            dataset_path,
            chunks=chunks,
            drop_variables=drop_variables,
            storage_options=storage_options
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

    # mask variables by different variable in ds based on dataset_spec
    if mask_variables is not None:
        for data_var, mask_var in mask_variables.items():
            try:
                curr_mask = ds[mask_var]
                ds = ds.sel({mask_var: curr_mask})
                ds = ds.drop(mask_var)
            except Exception as e:
                logger.warning(f"Could not apply requested mask ({mask_var}) on ({data_var}): {e}")

    return ds

def _infer_dataset_type(dataset_path: str) -> str:
    if dataset_path.endswith(".nc"):
        return "netcdf"
    elif dataset_path.endswith(".grib2"):
        return "grib2"
    elif dataset_path.endswith("json"):
        return "kerchunk"
    elif dataset_path.endswith(".zarr"):
        return "zarr"

    return "unknown"

def _load_netcdf(
    dataset_path: str, 
    engine: Optional[str], 
    chunks: Optional[str | dict], 
    drop_variables: Optional[str | list[str]],
):
    return xr.open_dataset(
        dataset_path, 
        engine=engine if engine is not None else "netcdf4", 
        chunks=chunks, 
        drop_variables=drop_variables
    )

# TODO: Network support?
def _load_grib(
    dataset_path: str,
    chunks: Optional[str | dict], 
    drop_variables: Optional[str | list[str]],
):
    return xr.open_dataset(
        dataset_path, 
        engine="cfgrib", 
        chunks=chunks, 
        drop_variables=drop_variables
    )

def _load_kerchunk(
    dataset_path: str, 
    chunks: Optional[str | dict], 
    drop_variables: Optional[str | list[str]],
    storage_options: Optional[dict]
):
    if not os.path.exists(dataset_path):
        storage_options["target_protocol"] = storage_options.get("target_protocol", "s3")
        storage_options["target_options"] = storage_options.get("target_options", {"anon": True})
        storage_options["remote_protocol"] = storage_options.get("remote_protocol", "s3")
        storage_options["remote_options"] = storage_options.get("remote_options", {"anon": True})

    return xr.open_dataset(
        dataset_path,
        engine="kerchunk",
        chunks=chunks,
        drop_variables=drop_variables,
        storage_options=storage_options if len(storage_options) > 0 else None,
        open_dataset_options=dict(
            chunks=chunks
        )
    )

def _load_zarr(
    dataset_path: str, 
    chunks: Optional[str | dict], 
    drop_variables: Optional[str | list[str]],
    storage_options: Optional[dict],
):
    if os.path.exists(dataset_path):
        return xr.open_dataset(
            dataset_path,
            engine="zarr",
            chunks=chunks,
            drop_variables=drop_variables,
            backend_kwargs=dict(consolidated=False)
        )
    else:
        storage_options = {
            **(storage_options if storage_options is not None else {}),
            "fo": dataset_path,
            "target_protocol": storage_options.get("target_protocol", "s3"),
            "target_options": storage_options.get("target_options", {"anon": True}),
            "remote_protocol": storage_options.get("remote_protocol", "s3"),
            "remote_options": storage_options.get("remote_options", {"anon": True})
        }

        is_zarr_2 = zarr.__version__ < "3.0.0"
        if "remote_options" in storage_options:
            storage_options["remote_options"]["asynchronous"] = not is_zarr_2
        else:
            storage_options["remote_options"] = {"asynchronous": not is_zarr_2}

        return xr.open_dataset(
            "reference://",
            engine="zarr",
            chunks=chunks,
            drop_variables=drop_variables,
            backend_kwargs=dict(
                consolidated=False,
                storage_options=storage_options,
            )
        )

def _load_virtual_icechunk(
    dataset_path: str, 
    chunks: Optional[str | dict], 
    drop_variables: Optional[str | list[str]],
    storage_options: Optional[dict],
):
    ic_creds = None
    ic_config = icechunk.RepositoryConfig.default()
    if "virtual_chunk_container" in storage_options:
        chunk_params = storage_options.pop("virtual_chunk_container", {})
        if chunk_params.get("type", "s3").lower() == "s3":
            ic_config.set_virtual_chunk_container(
                icechunk.VirtualChunkContainer(
                    "s3", "s3://", icechunk.s3_store(**chunk_params.get("store", {}))
                )
            )
            ic_creds = icechunk.containers_credentials(
                s3=icechunk.s3_credentials(**chunk_params.get("credentials", {"anonymous": True}))
            )

    ic_storage = icechunk.local_filesystem_storage(dataset_path)
    repo_type = storage_options.pop("type", "s3").lower()
    if repo_type == "s3":
        parsed_bucket = dataset_path.replace("s3://", "").split("/")[0]
        parsed_prefix = dataset_path.replace("s3://", "").split("/")[-1]

        ic_storage = icechunk.s3_storage(
            **storage_options,
            bucket=storage_options.get("bucket", parsed_bucket),
            prefix=storage_options.get("prefix", parsed_prefix),
        )

    if not icechunk.Repository.exists(ic_storage):
        raise Exception(f"Could not open icechunk repository for {dataset_path}")

    repo = icechunk.Repository.open(ic_storage, ic_config, ic_creds)
    branches = repo.list_branches()
    session = repo.readonly_session(
        "main" if "main" in branches else
        "master" if "master" in branches else
        branches[0]
    )

    return xr.open_zarr(
        session.store,
        chunks=chunks,
        drop_variables=drop_variables,
        consolidated=False, 
        zarr_format=3
    )
