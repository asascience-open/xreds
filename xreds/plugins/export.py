import io
import os
import uuid
from typing import List, Optional, Sequence

import fsspec
import netCDF4
import xarray as xr
from xarray.backends.api import dump_to_store
from xarray.backends.netCDF4_ import NetCDF4DataStore
from fastapi import APIRouter, Depends, Response
from xpublish import Dependencies, Plugin, hookimpl


def dataset_to_netcdf4_bytes(ds: xr.Dataset, name: str) -> bytes:
    """Convert an xarray dataset to a NetCDF4 file in memory

    If you dont do it this way, it requires either writing to disk or
    using netcdf3 format which does not work with certain data types
    https://github.com/pydata/xarray/issues/2995#issuecomment-657798184
    """
    # Load the dataset into memory, if this is not done, any dask arrays may not
    # be serialized because netcdf4 store does not know what to do with it
    loaded = ds.load()
    nc_ds = netCDF4.Dataset(name, mode="w", diskless=True, persist=False, memory=True)
    nc_store = NetCDF4DataStore(nc_ds)
    dump_to_store(loaded, store=nc_store)

    # See https://unidata.github.io/netcdf4-python/#in-memory-diskless-datasets
    out_mem = nc_ds.close()
    out_bytes = out_mem.tobytes()
    return out_bytes


class ExportPlugin(Plugin):
    name: str = "export"

    app_router_prefix: str = "/export"
    app_router_tags: Sequence[str] = ["export"]

    dataset_router_prefix: str = "/export"
    dataset_router_tags: Sequence[str] = ["export"]

    export_threshold: int = 500

    def __init__(self, export_threshold: Optional[int] = None):
        super().__init__(name="export")
        if export_threshold is not None:
            self.export_threshold = export_threshold

    @hookimpl
    def app_router(self):
        """Register an application level router for EDR format info"""
        router = APIRouter(
            prefix=self.app_router_prefix, tags=list(self.app_router_tags)
        )

        @router.get(
            "/formats",
            summary="Available dataset export formats",
        )
        def get_export_formats():
            """
            Returns the various supported formats for exporting datasets
            """
            formats = {
                "nc": "Export the dataset in NetCDF4 format",
            }

            return formats

        @router.get(
            "/threshold",
            summary="Get the threshold for exporting files",
        )
        def get_netcdf_threshold():
            """
            Returns the threshold for exporting files in MB
            """
            return {"threshold": self.export_threshold}

        return router

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(
            prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags)
        )

        @router.get(
            "/{filename}",
            summary="Export a dataset with the specified filename. The format is determined by the file extension.",
        )
        def export(filename: str, dataset=Depends(deps.dataset)):
            # Maximum filename length is 250 characters
            if filename.endswith(".nc")and len(filename) < 250:
                # Export netcdf if the size is below our threshold
                mbs = dataset.nbytes / 1024**2
                if mbs < self.export_threshold:
                    fname = None
                    try:
                        # TODO: more filename cleaning?
                        fname = f"{filename.split('.')[-2]}-{uuid.uuid4()}.nc"
                        nc = dataset_to_netcdf4_bytes(dataset, fname)
                        return Response(
                            content=nc,
                            media_type="application/x-netcdf",
                            headers={
                                "Content-Disposition": f"attachment; filename={filename}",
                                "Content-Length": str(len(nc)),
                            },
                        )
                    except Exception as e:
                        return {"message": f"Error exporting dataset: {e}"}
                    finally:
                        if fname is not None and os.path.exists(fname):
                            os.remove(fname)
                else:
                    return {
                        "message": f"File too large to export. Limit is {self.export_threshold}MB and the requested file is {mbs}MB"
                    }

            return {"message": "Unsupported file format"}

        return router
