from typing import Sequence

from fastapi import APIRouter, Depends
from xpublish import Dependencies, Plugin, hookimpl


def multiplier_for_unit(unit: str):
    """Get the multiplier for a scale string

    The scal string is a string that represents a scale, such as 'MB' or 'GB'.

    Args:
        unit (str): The scale string
    Returns:
        int: The multiplier for the scale
    """
    if unit == 'B':
        return 1
    if unit == 'KB':
        return 1024
    if unit == 'MB':
        return 1024 ** 2
    if unit == 'GB':
        return 1024 ** 3
    if unit == 'TB':
        return 1024 ** 4
    raise ValueError(f"Invalid scale '{unit}'")


class SizePlugin(Plugin):

    name: str = 'size'

    dataset_router_prefix: str = '/size'
    dataset_router_tags: Sequence[str] = ['size']

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        @router.get('/')
        def get_size(dataset=Depends(deps.dataset), unit: str = 'MB'):
            unit = unit.upper()
            multiplier = multiplier_for_unit(unit)
            size = dataset.nbytes / multiplier
            return {'size': size, 'unit': unit}

        return router
