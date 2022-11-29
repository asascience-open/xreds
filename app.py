import os
import xpublish

from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from xreds.server import DatasetServer
from xpublish_opendap import dap_router
from xpublish_wms import cf_wms_router


dataset_service = DatasetServer(
    routers = [
        (xpublish.routers.base_router, {'tags': ['info']}),
        (cf_wms_router, {'tags': ['wms'], 'prefix': '/wms'}),
        (dap_router, {'tags': ['opendap'], 'prefix': '/dap'})
    ]
)

app = dataset_service.app

app.add_middleware(
    CORSMiddleware, 
    allow_origins=['*'], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.title = 'XREDS'
app.description = 'XArray Environmental Data Services exposes environmental model data in common data formats for digestion in applications and notebooks'

app.mount("/static", StaticFiles(directory="static"), name="static")
app.root_path = os.environ.get('ROOT_PATH')

if __name__ == '__main__': 
    import uvicorn

    # When run directly, run in debug mode 
    uvicorn.run(
        "app:app", 
        port = 8090, 
        reload = True, 
        log_level = 'debug', 
        debug = True
    )