import os
import xpublish

from fastapi.middleware.cors import CORSMiddleware
from xreds.plugins.export import ExportPlugin
from xreds.plugins.size_plugin import SizePlugin

from xreds.spastaticfiles import SPAStaticFiles
from xreds.dataset_provider import DatasetProvider
from xreds.plugins.subset_plugin import SubsetPlugin, SubsetSupportPlugin


rest = xpublish.Rest(
    app_kws=dict(
        title="XREDS",
        description="XArray Environmental Data Services exposes environmental model data in common data formats for digestion in applications and notebooks",
        openapi_url="/xreds.json",
    ),
    cache_kws=dict(available_bytes=1e9),
    datasets=None,
)

rest.register_plugin(DatasetProvider())
rest.register_plugin(SubsetSupportPlugin())
rest.register_plugin(SubsetPlugin())
rest.register_plugin(SizePlugin())
rest.register_plugin(ExportPlugin(netcdf_threshold=500))

app = rest.app

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/", SPAStaticFiles(directory="./viewer/dist", html=True), name="viewer")
app.root_path = os.environ.get("ROOT_PATH")


if __name__ == "__main__":
    import uvicorn

    # When run directly, run in debug mode
    uvicorn.run("app:app", port=8090, reload=True, log_level="debug")
