import numpy as np
import xarray as xr

from xreds.dataset_extension import DatasetExtension, hookimpl
from xreds.logging import logger


class VectorPair():
    def __init__(self):
        self.x_var = None
        self.y_var = None

    def is_complete(self):
        return self.x_var is not None and self.y_var is not None


class VirtualVectorsTransformationExtension(DatasetExtension):
    """Virtual vector variables transformation extension"""

    name: str = "virtual_vectors"

    @hookimpl
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        """Transform a dataset by adding virtual vector variables"""

        vector_pairs = {}
        for var_name in ds:
            var = ds[var_name]
            if "standard_name" not in var.attrs:
                continue

            def get_or_init_pair(vector_name):
                if vector_name not in vector_pairs:
                    vector_pairs[vector_name] = VectorPair()
                return vector_pairs[vector_name]

            def get_vector_var_name(std_name, prefixes, substrs, excludes):
                if any(exclude in std_name for exclude in excludes):
                    return None
                for prefix in prefixes:
                    if std_name.startswith(prefix):
                        return std_name.removeprefix(prefix)
                for substr in substrs:
                    if substr in std_name:
                        return std_name.replace(substr, "_")
                return None

            def check_scalar(var, vector_pair_attr, prefixes, substrs, excludes):
                vector_name = get_vector_var_name(
                    std_name=var.attrs["standard_name"],
                    prefixes=prefixes,
                    substrs=substrs,
                    excludes=excludes)
                if vector_name:
                    setattr(get_or_init_pair(vector_name), vector_pair_attr, var)

            check_scalar(
                var,
                vector_pair_attr="x_var",
                prefixes=["eastward_"],
                substrs=["_eastward_", "_x_"],
                excludes=["_x_edges", "_x_spacing"])
            check_scalar(
                var,
                vector_pair_attr="y_var",
                prefixes=["northward_"],
                substrs=["_northward_", "_y_"],
                excludes=["_y_edges", "_y_spacing"])

        for pair_var_name in vector_pairs:
            vector_pair = vector_pairs[pair_var_name]
            if not vector_pair.is_complete():
                continue

            x_var = vector_pair.x_var
            y_var = vector_pair.y_var

            if not x_var.dims == y_var.dims:
                logger.warn(
                   f'Discovered vector pair {x_var.name}/{y_var.name}'
                   f' have mismatched dims {x_var.dims} vs {y_var.dims}'
                   ', skipping'
                )
                continue

            template_var = x_var
            vector_long_name = pair_var_name.replace("_", " ")

            speed_var = xr.DataArray(
                data=np.sqrt(np.square(x_var) + np.square(y_var)),
                dims=template_var.dims,
                coords=template_var.coords,
                attrs=template_var.attrs,
            )
            del speed_var.attrs['standard_name']
            speed_var.attrs.update({
                "long_name": f"{vector_long_name} speed",
            })
            ds[f"{pair_var_name}_speed"] = speed_var

            # NOTE: this is not yet checked whatsoever for correctness
            #       with regard to wind or wave to/from direction conventions
            direction_var = xr.DataArray(
                data=np.degrees(np.arctan2(x_var, y_var)) % 360,
                dims=template_var.dims,
                coords=template_var.coords,
                attrs=template_var.attrs,
            )
            del direction_var.attrs['standard_name']
            direction_var.attrs.update({
                "long_name": f"{vector_long_name} direction",
                "units": "degrees",
            })
            ds[f"{pair_var_name}_direction"] = direction_var

        return ds
