from dask_connect import DaskConnect
import dask_connect
import xarray as xr
import time
#from xpublish_wms import dask_wms


def loaddata():
    options = {'anon': True, 'use_ssl': False }
    #ds = dask_connect.load_data_s3('s3://ncdis-ra/jsons/fort.63_post_1980-1981.json', options)
    ds = dask_connect.load_data_s3('s3://nextgen-dmac/kerchunk/gfswave_global_kerchunk.json', options)
    #persist = ds.persist()
    return ds


def get_vars(ds):
    return ds.variables


#ds = loaddata()

start = time.time_ns()
connection = DaskConnect(False)
elapsedMs = (time.time_ns() - start) / 1000000
print("Connection took:", elapsedMs, "ms")

#server.shutdown_cluster()
start = time.time_ns()
f = connection.client.submit(loaddata)
v = connection.client.submit(get_vars, f)

print(v.result())
elapsedMs = (time.time_ns() - start) / 1000000
print("Execution time:", elapsedMs, "ms")

#dask_wms.init(server.client)

# example WMS map call:
# http://localhost:8090/datasets/gfswave_global/wms/?service=WMS&version=1.3.0&request=GetMap&layers=swh&crs=EPSG:3857&bbox=-10018754.171394622,7514065.628545966,-7514065.628545966,10018754.17139462&width=512&height=512&styles=raster/default&colorscalerange=0,10&time=2022-10-29T05:00:00Z
#server.client.submit(dask_wms.getmap())

