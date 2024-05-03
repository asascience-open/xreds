from typing import Sequence, Optional

from fastapi import APIRouter, Depends
from numpy._typing import NDArray
from xpublish import Plugin, Dependencies, hookimpl
from xpublish.utils.api import DATASET_ID_ATTR_KEY

import xarray_subset_grid.accessor # noqa

from xreds.logging import logger


def extract_polygon_query(subset_query: str) -> NDArray:
    """Extract polygon as numpy array from subset query format

    The subset query format is a string representation of a polygon in the form:
        POLYGON((x1 y1, x2 y2, ..., xn yn))

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
        raise ValueError("Invalid polygon subset query format")
    points_str = match.group(1)
    points = [tuple(map(float, point.split())) for point in points_str.split(',')]
    return np.array(points)


def extract_bbox_query(subset_query: str) -> tuple[float, float, float, float]:
    """Extract bounding box as numpy array from subset query format and transform it to a polygon

    The subset query format is a string representation of a bounding box in the form:
        BBOX(minx, miny, maxx, maxy)

    Args:
        subset_query (str): The subset query string
    Returns:
        np.ndarray: The bounding box
    """
    import re

    # Extract the bbox from the query
    match = re.match(r'BBOX\(([^,]+),([^,]+),([^,]+),([^,]+)\)', subset_query)
    if match is None:
        raise ValueError("Invalid bbox subset query format")
    bbox = [float(c) for c in match.groups()]
    return bbox[0], bbox[1], bbox[2], bbox[3]


def extract_time_query(subset_query: str) -> tuple[str, str]:
    """Extract time range from subset query format

    The subset query format is a string representation of a time range in the form:
        TIME(start, end)

    Args:
        subset_query (str): The subset query string
    Returns:
        tuple[str, str]: The time range
    """
    import re

    # Extract the time range from the query
    match = re.match(r'TIME\(([^,]+),([^,]+)\)', subset_query)
    if match is None:
        raise ValueError("Invalid time subset query format")

    groups = match.groups()

    start = groups[0]
    end = groups[1]
    return start, end


class SubsetQuery:
    points: Optional[NDArray]
    bbox: Optional[tuple[float, float, float, float]]
    time: Optional[tuple[str, str]]

    def __init__(self, points: Optional[NDArray], bbox: Optional[tuple[float, float, float, float]], time: Optional[tuple[str, str]] = None):
        self.points = points
        self.bbox = bbox
        self.time = time

    @staticmethod
    def from_query(subset_query: str):
        """Parse subset query string into a SubsetQuery object

        The subset query format is a string representation of a subset query in the form:
            QUERY(ARGS)&QUERY(ARGS)&...

        The ARGS can be any of the following:
            POLYGON((x1 y1, x2 y2, ..., xn yn))
            BBOX(minx, miny, maxx, maxy)
            TIME(start, end)

        Args:
            subset_query (str): The subset query string
        Returns:
            SubsetQuery: The parsed subset query class instance
        """
        queries = subset_query.split('&')
        points = None
        bbox = None
        time = None

        logger.info(f"Extracting subset query from {subset_query}")

        for query in queries:
            if 'POLYGON' in query:
                points = extract_polygon_query(query)
            elif 'BBOX' in query:
                bbox = extract_bbox_query(query)

            if 'TIME' in query:
                time = extract_time_query(query)

        return SubsetQuery(points=points, bbox=bbox, time=time)

    def __str__(self):
        return f"SubsetQuery(points={self.points}, time={self.time})"

    def subset(self, ds):
        """Subset the dataset using the extracted query arguments"""
        if self.points is not None:
            ds = ds.subset_grid.grid.subset_polygon(ds, self.points)
        elif self.bbox is not None:
            ds = ds.subset_grid.grid.subset_bbox(ds, self.bbox)
        if self.time is not None:
            # Remove Z from the time strings for now to avoid issues with parsing
            # from xarray. This is due to most datasets not using time aware
            # times
            # TODO: Remove this when time aware times are supported
            time = (self.time[0].replace('Z', ''), self.time[1].replace('Z', ''))
            ds = ds.cf.sel(time=slice(*time))
        return ds


def format_timestamp(value):
    return value.dt.strftime(date_format="%Y-%m-%dT%H:%M:%SZ").values

class SubsetSupportPlugin(Plugin):

    name: str = 'subset_support'

    dataset_router_prefix: str = '/subset_support'
    dataset_router_tags: Sequence[str] = ['subset_support']

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        @router.get('/time_range')
        def time_range(dataset=Depends(deps.dataset)):
            min_time = dataset.cf['time'].min().dt.strftime(date_format="%Y-%m-%dT%H:%M:%SZ").values
            max_time = dataset.cf['time'].max().dt.strftime(date_format="%Y-%m-%dT%H:%M:%SZ").values
            return {'min_time': f'{min_time}', 'max_time': f'{max_time}'}

        return router


class SubsetPlugin(Plugin):

    name: str = 'subset'

    dataset_router_prefix: str = '/subset'
    dataset_router_tags: Sequence[str] = ['subset']

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        def get_subset_dataset(dataset_id: str, subset_query: SubsetQuery = Depends(SubsetQuery.from_query)):
            logger.info(f"Getting subset dataset {dataset_id} with query {subset_query}")
            ds = deps.dataset(dataset_id)
            ds_subset = subset_query.subset(ds)
            ds_subset.attrs[DATASET_ID_ATTR_KEY] = f"{self.name}/{dataset_id}/subset?{subset_query}"

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

        # We can subset a vdatum dataset, but not the other way around
        vdatum_plugin = [p for p in all_plugins if p.name == 'vdatum']
        this_plugin.extend(vdatum_plugin)

        for new_router in deps.plugin_manager().subset_hook_caller('dataset_router', remove_plugins=this_plugin)(deps=subset_deps):
            router.include_router(new_router, prefix="/{subset_query}")

        return router
