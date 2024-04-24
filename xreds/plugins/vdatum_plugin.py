from typing import Sequence

import xarray as xr
from fastapi import APIRouter
from xpublish import Plugin, Dependencies, hookimpl
from xpublish.utils.api import DATASET_ID_ATTR_KEY

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


class VDatumPlugin(Plugin):

    name: str = 'vdatum'

    dataset_router_prefix: str = '/vdatum'
    dataset_router_tags: Sequence[str] = ['vdatum']

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        def get_vdatum_transformed_dataset(dataset_id: str) -> xr.Dataset:
            logger.info(f"Getting vdatum transformed dataset {dataset_id}")
            ds = deps.dataset(dataset_id)

            if 'zeta' not in ds.variables:
                raise ValueError(f"Dataset {dataset_id} does not have a zeta variable")
            
            vdatum_file = ds.attrs.get('vdatum_file', None)
            if vdatum_file is None:
                raise ValueError(f"Dataset {dataset_id} does not have a vdatum_path attribute")
            
            ds_vdatum = load_dataset({'path': vdatum_file})
            if ds_vdatum is None:
                raise ValueError(f"Could not load vdatum dataset from {vdatum_file}")
        
            ds_transformed = transform_mllw(ds, ds_vdatum)
            ds_transformed.attrs[DATASET_ID_ATTR_KEY] = f"{self.name}/{dataset_id}/vdatum"
            return ds_transformed

        vdatum_deps = Dependencies(
            dataset_ids=deps.dataset_ids,
            dataset=get_vdatum_transformed_dataset,
            cache=deps.cache,
            plugins=deps.plugins,
            plugin_manager=deps.plugin_manager,
        )

        all_plugins = list(deps.plugin_manager().get_plugins())
        this_plugin = [p for p in all_plugins if p.name == self.name]

        for new_router in deps.plugin_manager().subset_hook_caller('dataset_router', remove_plugins=this_plugin)(deps=vdatum_deps):
            router.include_router(new_router, prefix="")

        return router
