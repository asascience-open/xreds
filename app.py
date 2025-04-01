import xpublish

from fastapi.middleware.cors import CORSMiddleware

from xreds.config import settings
from xreds.logging import logger, configure_app_logger, configure_fastapi_logger
from xreds.plugins.export import ExportPlugin
from xreds.plugins.size_plugin import SizePlugin
from xreds.spastaticfiles import SPAStaticFiles
from xreds.dataset_provider import DatasetProvider
from xreds.plugins.subset_plugin import SubsetPlugin, SubsetSupportPlugin

configure_app_logger()
logger.info(f"XREDs started with settings: {settings.__dict__}")

rest = xpublish.Rest(
    app_kws=dict(
        title="XREDS",
        description="XArray Environmental Data Services exposes environmental model data in common data formats for digestion in applications and notebooks",
        openapi_url="/xreds.json",
        lifespan=configure_fastapi_logger
    ),
    cache_kws=dict(available_bytes=1e9),
    datasets=None,
)

export_threshold = settings.export_threshold

rest.register_plugin(DatasetProvider())
rest.register_plugin(SubsetSupportPlugin())
rest.register_plugin(SubsetPlugin())
rest.register_plugin(SizePlugin())
rest.register_plugin(ExportPlugin())

app = rest.app

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/", SPAStaticFiles(directory="./viewer/dist", html=True), name="viewer")
app.root_path = settings.root_path

if __name__ == "__main__":
    import uvicorn

    # When run directly, run in debug mode
    uvicorn.run("app:app", host="0.0.0.0", port=8090, reload=False)
