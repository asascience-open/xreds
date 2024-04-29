import xarray as xr

from xreds.dataset_extension import DatasetExtension, hookimpl
from xreds.logging import logger
from xreds.utils import load_dataset


def transform_mllw(ds: xr.Dataset, ds_vdatum: xr.Dataset) -> xr.Dataset:
    """Transform the dataset to MLLW

    Args:
        ds (xr.Dataset): The dataset to transform
        ds_vdatum (xr.Dataset): The vdatum dataset

    Returns:
        xr.Dataset: The transformed dataset
    """
    datum = ds_vdatum['mllwtomsl']
    zeta = ds['zeta']

    datum_dims = [k for k in datum.dims]
    target_dims = [k for k in zeta.dims]
    target_dims = target_dims[-len(datum_dims):]
    new_dims = {o: k for (o, k) in zip(datum_dims, target_dims)}

    # validate
    for o, k in new_dims.items():
        assert ds_vdatum.mllwtomsl[o].shape == ds.zeta[k].shape

    zeta_to_mllw = zeta + datum.rename(new_dims)
    zeta_to_mllw = zeta_to_mllw.assign_attrs({'datum': 'mllw'})

    ds_transformed = ds.assign(zeta_mllw=zeta_to_mllw)
    return ds_transformed


class VDatumTransformationExtension(DatasetExtension):
    """VDatum transformation extension
    """

    name: str = "vdatum"

    @hookimpl
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        """Transform a dataset"""
        if 'zeta' not in ds.variables:
            logger.warning(f"Dataset {ds.attrs.get('name', 'unknown')} does not have a zeta variable. Skipping vdatum transformation")
            return ds
            
        vdatum_file = config.get('path', None)
        if vdatum_file is None:
            logger.warning(f"Dataset {ds.attrs.get('name', 'unknown')} does not have a vdatum_path attribute. Skipping vdatum transformation")
            return ds
            
        ds_vdatum = load_dataset({'path': vdatum_file})
        if ds_vdatum is None:
            logger.warning(f"Could not load vdatum dataset from {vdatum_file}. Skipping vdatum transformation")
            return ds
        
        ds_transformed = transform_mllw(ds, ds_vdatum)
        return ds_transformed
