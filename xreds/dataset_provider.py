import datetime

import fsspec
import xarray as xr
import yaml
from pluggy import PluginManager
from xpublish import Plugin, hookimpl

from xreds.config import settings
from xreds.dataset_extension import DATASET_EXTENSION_PLUGIN_NAMESPACE
from xreds.dependencies.redis import get_redis
from xreds.extensions import VDatumTransformationExtension
from xreds.logging import logger
from xreds.redis import get_redis_cache
from xreds.utils import load_dataset

dataset_extension_manager = PluginManager(DATASET_EXTENSION_PLUGIN_NAMESPACE)
dataset_extension_manager.register(VDatumTransformationExtension, name="vdatum")


class DatasetProvider(Plugin):
    name: str = "xreds_datasets"
    dataset_mapping: dict = {}
    datasets: dict = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        if settings.datasets_mapping_file.startswith("s3"):
            fs = fsspec.filesystem("s3", anon=True)
        else:
            fs = fsspec.filesystem("file")

        with fs.open(settings.datasets_mapping_file, "r") as f:
            # load config using yaml, which can load json or yaml
            # because yaml is a superset of json
            self.dataset_mapping = yaml.safe_load(f)

    @hookimpl
    def get_datasets(self):
        return self.dataset_mapping.keys()

    @hookimpl
    def get_dataset(self, dataset_id: str) -> xr.Dataset:
        cache_key = f"dataset-{dataset_id}"

        redis_cache = get_redis_cache()

        cached_ds = self.datasets.get(cache_key, None)
        if cached_ds:
            if (datetime.datetime.now() - cached_ds["date"]).seconds < (
                settings.dataset_cache_timeout
            ):
                logger.info(f"Using cached dataset for {dataset_id}")
                return cached_ds["dataset"]
            else:
                logger.info(f"Cached dataset for {dataset_id} is stale, reloading...")
                self.datasets.pop(cache_key, None)
        else:
            logger.info(f"No dataset found in cache for {dataset_id}, loading...")

        dataset_spec = self.dataset_mapping[dataset_id]
        ds = load_dataset(
            dataset_spec,
            redis_cache=redis_cache,
            cache_timeout=settings.dataset_cache_timeout,
        )

        if ds is None:
            raise ValueError(f"Dataset {dataset_id} not found")

        # There is a better way to do this probably, but this works well and is very simple
        extensions = dataset_spec.get("extensions", {})
        for ext_name, ext_config in extensions.items():
            extension = dataset_extension_manager.get_plugin(ext_name)
            if extension is None:
                logger.error(
                    f"Could not find extension {ext_name} for dataset {dataset_id}"
                )
                continue
            else:
                logger.info(f"Applying extension {ext_name} to dataset {dataset_id}")
            ds = extension().transform_dataset(ds=ds, config=ext_config)

        # TODO: For now this cache is disabled for testing with redis
        # self.datasets[cache_key] = {"dataset": ds, "date": datetime.datetime.now()}

        if cache_key in self.datasets:
            logger.info(f"Loaded and cached dataset for {dataset_id}")
        else:
            logger.info(
                f"Loaded dataset for {dataset_id}. Not cached due to size or current cache score"
            )

        return ds
