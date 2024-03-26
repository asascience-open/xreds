from typing import Sequence

from fastapi import APIRouter, Depends
from numpy._typing import NDArray
from xpublish import Plugin, Dependencies, hookimpl

import xarray_subset_grid.accessor # noqa

from xreds.logging import logger


def extract_polygon_query(subset_query: str):
    """Extract polygon as numpy array from subset query format

    The subset query format is a string representation of a polygon in the form:
        POLYGON=((x1 y1, x2 y2, ..., xn yn))

    This function extracts the points from the string and returns them as a numpy array.

    Args:
        subset_query (str): The subset query string
    Returns:
        np.ndarray: The polygon points
    """
    import numpy as np
    import re

    # Extract the points from the query
    match = re.match(r'POLYGON\(\(([^\)]+)\)\)', subset_query)
    if match is None:
        raise ValueError("Invalid subset query format")
    points_str = match.group(1)
    points = [tuple(map(float, point.split())) for point in points_str.split(',')]
    return np.array(points)


class SubsetPlugin(Plugin):

    name: str = 'subset'

    dataset_router_prefix: str = '/subset'
    dataset_router_tags: Sequence[str] = ['subset']

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        def get_subset_dataset(dataset_id: str, subset_query: NDArray = Depends(extract_polygon_query)):
            logger.info(f"Getting subset dataset {dataset_id} with query {subset_query}")
            ds = deps.dataset(dataset_id)
            grid = ds.subset_grid.grid
            ds_subset = grid.subset_polygon(ds, subset_query)
            return ds_subset

        subset_deps = Dependencies(
            dataset_ids=deps.dataset_ids,
            dataset=get_subset_dataset,
            cache=deps.cache,
            plugins=deps.plugins,
            plugin_manager=deps.plugin_manager,
        )

        all_plugins = list(deps.plugin_manager().get_plugins())
        this_plugin = [p for p in all_plugins if p.name == self.name]

        for new_router in deps.plugin_manager().subset_hook_caller('dataset_router', remove_plugins=this_plugin)(deps=subset_deps):
            router.include_router(new_router, prefix="/{subset_query}")

        return router
