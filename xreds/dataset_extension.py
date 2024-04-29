import pluggy
from pydantic import BaseModel, Field
import xarray as xr


DATASET_EXTENSION_PLUGIN_NAMESPACE = "xreds_dataset_extension"


hookspec = pluggy.HookspecMarker(DATASET_EXTENSION_PLUGIN_NAMESPACE)
hookimpl = pluggy.HookimplMarker(DATASET_EXTENSION_PLUGIN_NAMESPACE)


class DatasetExtensionSpec:
    """Dataset extension specification"""

    @hookspec
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        """Transform a dataset"""
        pass


class DatasetExtension(BaseModel):
    """Dataset Extension"""
    name: str = Field(..., description="Name of the dataset extension")