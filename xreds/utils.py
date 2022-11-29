import math
from typing import Any
from mercantile import Bbox
import numpy as np
import cf_xarray
import xarray as xr

from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from pyproj import Transformer


def lower_case_keys(d: dict) -> dict:
    return dict((k.lower(), v) for k, v in d.items())


def format_timestamp(value):
    return str(value.dt.strftime(date_format='%Y-%m-%dT%H:%M:%SZ').values)


def strip_float(value):
    return float(value.values)


def round_float_values(v: list) -> list:
    if not isinstance(v, list):
        return round(v, 5)
    return [round(x, 5) for x in v]


def extract_range(da: xr.DataArray, precision: int = 5) -> tuple[float, float]:
    '''
    Given an xarray data array, returns the min and max fo the array in a tuple, rounded to the specified 
    precision
    '''
    return (round(float(da.min().values), precision), round(float(da.max().values), precision))


def extract_abs_range(da: xr.DataArray, precision: int = 5) -> tuple[float, float]:
    '''
    Given an xarray data array, returns the absolute value min and max fo the array in a tuple, rounded to the specified 
    precision and
    '''
    abs_da = abs(da)
    return (round(float(abs_da.min().values), precision), round(float(abs_da.max().values), precision))


def extract_bounds(da: xr.DataArray, precision: int = 5) -> tuple[float, float, float, float]:
    '''
    Given an xarray data array, returns cartesian bounds of the array in a tuple, rounded to the specified precision. 
    Returns in the format [min_x, min_y, ,max_x, max_y]
    '''
    x_range = extract_range(da.cf['X'], precision)
    y_range = extract_range(da.cf['Y'], precision)

    return [x_range[0], y_range[0], x_range[1], y_range[1]]


def speed_and_dir_for_uv(u, v):
    '''
    Given u and v values or arrays, calculate speed and direction transformations
    '''
    speed = np.sqrt(u**2 + v**2)

    dir_trig_to = np.arctan2(u/speed, v/speed)
    dir_trig_deg = dir_trig_to * 180/np.pi 
    dir = (dir_trig_deg) % 360

    return [speed, dir]


def extract_geospatial_data(ds: xr.Dataset | xr.DataArray, bbox: Bbox, crs: Any, width: int, height: int, resampling_method: Resampling = Resampling.nearest) -> xr.DataArray | xr.Dataset:
    '''
    Given a dataset or array ds, extract the given window of data and reproject to the specified coordinate system with the given width and height data dimensions
    '''
    clipped = ds.rio.clip_box(*bbox, crs=crs)
    resampled = clipped.rio.reproject(
        crs, 
        shape=(width, height), 
        resampling=resampling_method, 
        transform=from_bounds(*bbox, width=width, height=height),
    )
    return resampled


to_mercator = Transformer.from_crs(4326, 3857, always_xy=True)

to_lnglat = Transformer.from_crs(3857, 4326, always_xy=True)
