from typing import Literal
import xarray as xr

from xreds.config import settings
from xreds.dataset_extension import DatasetExtension, hookimpl
from xreds.logging import logger
from xreds.redis import get_redis_cache
from xreds.utils import load_dataset


def transform_datum(
    ds: xr.Dataset,
    ds_vdatum: xr.Dataset,
    target_zeta_var: str,
    target_datum_var: str,
    target_datum_name: str,
    multiplier: float,
    out_datum_var: str,
) -> xr.Dataset:
    """Transform the dataset to target datum

    Args:
        ds (xr.Dataset): The dataset to transform
        ds_vdatum (xr.Dataset): The vdatum dataset
        target_zeta_var (str): The variable name of the water level
        target_datum_var (str): The variable name of the target datum
        target_datum_name (str): The name of the target datum
        multiplier (float): The multiplier to apply to the target datum. Usually 1.0 or -1.0
        out_datum_var (str): The name of the output variable

    Returns:
        xr.Dataset: The transformed dataset
    """
    datum = ds_vdatum[target_datum_var]
    zeta = ds[target_zeta_var]

    datum_dims = [k for k in datum.dims]
    target_dims = [k for k in zeta.dims]
    target_dims = target_dims[-len(datum_dims) :]
    new_dims = {o: k for (o, k) in zip(datum_dims, target_dims)}

    # validate
    for o, k in new_dims.items():
        assert ds_vdatum[target_datum_var][o].shape == ds.zeta[k].shape

    zeta_to_datum = zeta + (multiplier * datum.rename(new_dims))
    zeta_to_datum = zeta_to_datum.assign_attrs({"datum": target_datum_name})

    ds_transformed = ds.assign({out_datum_var: zeta_to_datum})
    return ds_transformed


class VDatumTransformationExtension(DatasetExtension):
    """VDatum transformation extension"""

    name: str = "vdatum"

    @hookimpl
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        """Transform a dataset"""
        if "zeta" not in ds.variables:
            logger.warning(
                f"Dataset {ds.attrs.get('name', 'unknown')} does not have a zeta variable. Skipping vdatum transformation"
            )
            return ds

        vdatum_file = config.get("path", None)
        if vdatum_file is None:
            logger.warning(
                f"Dataset {ds.attrs.get('name', 'unknown')} does not have a vdatum_path attribute. Skipping vdatum transformation"
            )
            return ds

        redis_cache = get_redis_cache()
        ds_vdatum = load_dataset({"path": vdatum_file}, redis_cache=redis_cache, cache_timeout=settings.dataset_cache_timeout)
        if ds_vdatum is None:
            logger.warning(
                f"Could not load vdatum dataset from {vdatum_file}. Skipping vdatum transformation"
            )
            return ds

        target_zeta_var = config.get("water_level_var", "zeta")
        target_datum_var = config.get("vdatum_var", None)
        target_datum_name = config.get("vdatum_name", None)
        multiplier = config.get("multiplier", 1.0)

        if target_datum_var is None or target_datum_name is None:
            logger.warning(
                f"Dataset {ds.attrs.get('name', 'unknown')} does not have a vdatum_var or vdatum_name attribute. Skipping vdatum transformation"
            )
            return ds

        out_datum_var = f"{target_zeta_var}_{target_datum_name}"

        ds_transformed = transform_datum(
            ds,
            ds_vdatum,
            target_zeta_var,
            target_datum_var,
            target_datum_name,
            multiplier,
            out_datum_var
        )
        return ds_transformed
