import numpy as np
import xarray as xr

from xreds.dataset_extension import DatasetExtension, hookimpl
from xreds.logging import logger


class ROMSExtension(DatasetExtension):
    """Transform ROMS currents to the global reference frame

    Urho(i,j) = 0.5 * ( U(i,j) + U(i+1,j) )
    Vrho(i,j) = 0.5 * ( V(i,j) + V(i,j+1) )

    u(LON,LAT)=u(XI,ETA)*cos(angle(i,j))-v(XI,ETA)*sin(angle(i,j))
    v(LON,LAT)=v(XI,ETA)*cos(angle(i,j))+u(XI,ETA)*sin(angle(i,j))

    For an illustration of the grid see https://www.myroms.org/wiki/Numerical_Solution_Technique
    """

    name: str = "roms"

    @hookimpl
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        angle = ds.angle

        default_da: xr.DataArray | None = None
        if "s_rho" in ds.dims:
            if "temp" in ds:
                default_da = ds.temp
            if "temp_sur" in ds:
                default_da = ds.temp_sur
            elif "salt" in ds:
                default_da = ds.salt
            elif "salt_sur" in ds:
                default_da = ds.salt_sur

        if default_da is None:
            logger.warn(
                "No default data array found in dataset. Skipping ROMS transformation"
            )
            return ds

        # Start with u
        u_name = "u_sur" if "u_sur" in ds else "u"
        u = ds[u_name]

        u_rho = default_da.copy()
        u_rho.name = "u_rho"
        u_rho.attrs["field"] = u.attrs["field"]
        u_rho.attrs["units"] = u.attrs["units"]
        u_rho.attrs["standard_name"] = u.attrs["standard_name"]
        u_rho.attrs["long_name"] = u.attrs["long_name"]

        # Have to rename the dimensions to match the rho grid, otherwise
        # xarray will refuse
        u_renamed = u.rename(
            {
                "xi_u": "xi_rho",
                "eta_u": "eta_rho",
                "lat_u": "lat_rho",
                "lon_u": "lon_rho",
            }
        )

        u_center = 0.5 * (
            u_renamed.loc[dict(xi_rho=slice(0, -1))]
            + u_renamed.loc[dict(xi_rho=slice(1, None))]
        )
        u_first = u_renamed.loc[dict(xi_rho=0)]
        u_last = u_renamed.loc[dict(xi_rho=-1)]
        u_rho = xr.concat(
            [u_first, u_center, u_last],
            dim="xi_rho",
            coords="minimal",
            compat="override",
        )
        u_rho["lat_rho"] = ds.lat_rho
        u_rho["lon_rho"] = ds.lon_rho

        # Now do v
        v_name = "v_sur" if "v_sur" in ds else "v"
        v = ds[v_name]

        v_rho = default_da.copy()
        v_rho.name = "v_rho"
        v_rho.attrs["field"] = v.attrs["field"]
        v_rho.attrs["units"] = v.attrs["units"]
        v_rho.attrs["standard_name"] = v.attrs["standard_name"]
        v_rho.attrs["long_name"] = v.attrs["long_name"]

        # Have to rename the dimensions to match the rho grid, otherwise
        # xarray will refuse
        v_renamed = v.rename(
            {
                "xi_v": "xi_rho",
                "eta_v": "eta_rho",
                "lat_v": "lat_rho",
                "lon_v": "lon_rho",
            }
        )

        v_center = 0.5 * (
            v_renamed.loc[dict(eta_rho=slice(0, -1))]
            + v_renamed.loc[dict(eta_rho=slice(1, None))]
        )
        v_first = v_renamed.loc[dict(eta_rho=0)]
        v_last = v_renamed.loc[dict(eta_rho=-1)]
        v_rho = xr.concat(
            [v_first, v_center, v_last],
            dim="eta_rho",
            coords="minimal",
            compat="override",
        )
        v_rho["lat_rho"] = ds.lat_rho
        v_rho["lon_rho"] = ds.lon_rho

        u_rotated = u_rho * np.cos(angle) - v_rho * np.sin(angle)
        u_rotated = u_rotated.assign_attrs(u_rho.attrs)
        u_rotated.name = f"{u_name}_rotated"
        u_rotated.attrs["long_name"] = "u velocity rotated from ROMS grid"

        v_rotated = v_rho * np.cos(angle) + u_rho * np.sin(angle)
        v_rotated = v_rotated.assign_attrs(v_rho.attrs)
        v_rotated.name = f"{v_name}_rotated"
        v_rotated.attrs["long_name"] = "v velocity rotated from ROMS grid"

        ds[f"{u_name}_rotated"] = u_rotated
        ds[f"{v_name}_rotated"] = v_rotated

        return ds
