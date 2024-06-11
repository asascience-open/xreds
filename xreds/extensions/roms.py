import numpy as np
import xarray as xr

from xreds.dataset_extension import DatasetExtension, hookimpl


class ROMSExtension(DatasetExtension):
    """Transform ROMS currents to the global reference frame

    Urho(i,j) = 0.5 * ( U(i,j) + U(i+1,j) )
    Vrho(i,j) = 0.5 * ( V(i,j) + V(i,j+1) )

    u(LON,LAT)=u(XI,ETA)*cos(angle(i,j))-v(XI,ETA)*sin(angle(i,j))
    v(LON,LAT)=v(XI,ETA)*cos(angle(i,j))+u(XI,ETA)*sin(angle(i,j))

    """

    name: str = "roms"

    @hookimpl
    def transform_dataset(self, ds: xr.Dataset, config: dict) -> xr.Dataset:
        angle = ds.angle

        # Start with u
        u = ds.u.isel(ocean_time=0, s_rho=0)

        u_rho = angle
        u_rho.name = 'u_rho'
        u_rho.attrs['field'] = u.attrs['field']
        u_rho.attrs['units'] = u.attrs['units']
        u_rho.attrs['standard_name'] = u.attrs['standard_name']
        u_rho.attrs['long_name'] = u.attrs['long_name']

        # Have to rename the dimensions to match the rho grid, otherwise
        # xarray will refuse
        u_renamed = u.rename({
            'xi_u': 'xi_rho',
            'eta_u': 'eta_rho'
        })

        u_rho[:, 1:-1] = 0.5 * (u_renamed[:, :-1] + u_renamed[:, 1:])
        u_rho[:, 0] = u_renamed[:, 0]
        u_rho[:, -1] = u_renamed[:, -1]

        # Now do v
        v = ds.v.isel(ocean_time=0, s_rho=0)

        v_rho = angle
        v_rho.name = 'v_rho'
        v_rho.attrs['field'] = v.attrs['field']
        v_rho.attrs['units'] = v.attrs['units']
        v_rho.attrs['standard_name'] = v.attrs['standard_name']
        v_rho.attrs['long_name'] = v.attrs['long_name']

        # Have to rename the dimensions to match the rho grid, otherwise
        # xarray will refuse
        v_renamed = v.rename({
            'xi_v': 'xi_rho',
            'eta_v': 'eta_rho'
        })

        v_rho[1:-1, :] = 0.5 * (v_renamed[:-1, :] + v_renamed[1:, :])
        v_rho[0, :] = v_renamed[0, :]
        v_rho[-1, :] = v_renamed[-1, :]

        u_rotated = u_rho * np.cos(angle) - v_rho * np.sin(angle)
        u_rotated = u_rotated.assign_attrs(u_rho.attrs)
        u_rotated.name = 'u_rotated'
        u_rotated.attrs['long_name'] = 'u velocity rotated from ROMS grid'

        v_rotated = v_rho * np.cos(angle) + u_rho * np.sin(angle)
        v_rotated = v_rotated.assign_attrs(v_rho.attrs)
        v_rotated.name = 'v_rotated'
        v_rotated.attrs['long_name'] = 'v velocity rotated from ROMS grid'

        ds['u_rotated'] = u_rotated
        ds['v_rotated'] = v_rotated

        return ds
