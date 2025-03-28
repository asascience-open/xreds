import pickle
import time
from datetime import datetime, timedelta

import fsspec
import redis
import xarray as xr
import yaml
from pluggy import PluginManager
from typing import Optional
from xpublish import Plugin, hookimpl

from xreds.config import settings
from xreds.dataset_extension import DATASET_EXTENSION_PLUGIN_NAMESPACE
from xreds.dependencies.redis import get_redis
from xreds.extensions import VDatumTransformationExtension
from xreds.extensions.roms import ROMSExtension
from xreds.logging import logger
from xreds.redis import get_redis_cache
from xreds.utils import load_dataset

dataset_extension_manager = PluginManager(DATASET_EXTENSION_PLUGIN_NAMESPACE)
dataset_extension_manager.register(VDatumTransformationExtension, name="vdatum")
dataset_extension_manager.register(ROMSExtension, name="roms")


class DatasetProvider(Plugin):
    class Config:
        arbitrary_types_allowed = True

    name: str = "xreds_datasets"
    dataset_mapping: dict = {}
    dataset_loading: dict = {}

    cache_times: dict = {}
    memory_cache: dict = {}
    redis_cache: Optional[redis.Redis] = get_redis_cache()

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        with fsspec.open(settings.datasets_mapping_file, "r") as f:
            # load config using yaml, which can load json or yaml
            # because yaml is a superset of json
            self.dataset_mapping = yaml.safe_load(f)

    @hookimpl
    def get_datasets(self):
        return self.dataset_mapping.keys()

    @hookimpl
    def get_dataset(self, dataset_id: str) -> xr.Dataset:
        # make sure that if other requests are currently fetching the dataset, just wait for them to finish
        # otherwise can cause huge memory issues if multiple async threads try to fetch a big dataset simultaneously
        if (settings.use_memory_cache or self.redis_cache is not None) and self._is_dataset_loading(dataset_id):
            logger.info(f"Waiting for dataset {dataset_id} to finish loading")
            while (self._is_dataset_loading(dataset_id)):
                time.sleep(0.5)

        # check if dataset already exists - if so load from cache
        cached_ds = self._load_dataset_from_cache(dataset_id)
        if cached_ds is not None:
            return cached_ds

        try:
            load_time = time.time()
            debug_time = time.time()

            # load data
            dataset_spec = self.dataset_mapping[dataset_id]
            self._set_dataset_loading(dataset_id, True)
            ds = load_dataset(dataset_spec)

            if ds is None:
                raise ValueError(f"Dataset {dataset_id} not found")
            
            logger.debug(f"Dataset {dataset_id} load time: {time.time() - debug_time}s")
            debug_time = time.time()

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
            
            logger.debug(f"Dataset {dataset_id} extension time: {time.time() - debug_time}s")
            logger.info(f"Loaded dataset for {dataset_id} in {time.time() - load_time}s")

            # save dataset to cache if caching is enabled
            self._add_dataset_to_cache(dataset_id, ds)
            self._set_dataset_loading(dataset_id, False)
            return ds
        except:
            self._set_dataset_loading(dataset_id, False)
            raise

    # loads a dataset from the cache
    #  - if memory caching is enabled -> checks first and loads from variable
    #  - if redis caching is enabled -> checks and then deserializes if exists
    #  - else -> return None
    def _load_dataset_from_cache(self, dataset_id: str):
        cache_key = self._get_dataset_cache_key(dataset_id)

        # make sure that cache_times has record of current dataset
        if cache_key not in self.cache_times:
            self.cache_times[cache_key] = {
                "expiration": datetime.now() + timedelta(seconds=settings.dataset_cache_timeout),
                "requested": datetime.now()
            }

        # check if dataset is expired - if so refetch data
        if datetime.now() > self.cache_times[cache_key]["expiration"]:
            self.cache_times.pop(cache_key)
            if cache_key in self.memory_cache:
                self.memory_cache.pop(cache_key)
            if self.redis_cache is not None and self.redis_cache.exists(cache_key):
                self.redis_cache.delete(cache_key)

            logger.info(f"Cached dataset for {dataset_id} is stale, reloading...")
            return None
        else:
            self.cache_times[cache_key]["requested"] = datetime.now()
        
        # load data from memory cache if exists
        if cache_key in self.memory_cache:
            logger.info(f"Using memory cached dataset for {dataset_id}")
            return self.memory_cache[cache_key]
        
        # load data from redis cache if exists
        if self.redis_cache is not None:
            serialized_ds = self.redis_cache.get(cache_key)
            if serialized_ds is not None:
                start_time = time.time()
                ds = pickle.loads(serialized_ds)
                    
                logger.debug(f"Using redis cached dataset for {dataset_id} (deserialization time: {time.time() - start_time}s)")
                # if loaded from redis cache - add to memory cache for faster access
                if settings.use_memory_cache and dataset_id not in self.memory_cache:
                    self._add_dataset_to_memory_cache(dataset_id, ds)

                return ds

        logger.info(f"No dataset found in cache for {dataset_id}, loading...")
        return None

    # adds fetched dataset to memory and/or redis cache
    def _add_dataset_to_cache(self, dataset_id: str, ds: xr.Dataset):
        cache_key = self._get_dataset_cache_key(dataset_id)

        # add dataset to redis cache if enabled
        if self.redis_cache is not None:
            start_time = time.time()
            serialized_ds = pickle.dumps(ds, protocol=-1)
            self.redis_cache.set(cache_key, serialized_ds, ex=settings.dataset_cache_timeout)
            logger.info(f"Redis cached dataset for {dataset_id} (serialization time: {time.time() - start_time}s)")
        
        # also add dataset to memory cache if enabled
        if settings.use_memory_cache:
            self._add_dataset_to_memory_cache(dataset_id, ds)
            
    # adds a dataset to the memory cache, dropping the least recently accessed dataset
    # if the current worker has already cached memory_cache_num_datasets datasets
    def _add_dataset_to_memory_cache(self, dataset_id: str, ds: xr.Dataset):
        cache_key = self._get_dataset_cache_key(dataset_id)

        # check if there's a limit of the number of datasets allowed in memory
        if settings.memory_cache_num_datasets > 0:
            diff = len(list(self.memory_cache.keys())) - (settings.memory_cache_num_datasets + 1)
            if diff > 0:
                for i in range(diff):
                    oldest_key = None
                    oldest_date = None
                    for key, val in self.cache_times.items():
                        if key == cache_key or key not in self.memory_cache:
                            continue

                        if oldest_key is None or val["requested"] < oldest_date:
                            oldest_key = key
                            oldest_date = val["requested"]

                    if oldest_key is not None:
                        self.cache_times.pop(oldest_key)
                        self.memory_cache.pop(oldest_key)
                        logger.info(f"Popped dataset {oldest_key} from memory cache")
        
        logger.info(f"Memory cached dataset for {dataset_id}")
        self.memory_cache[cache_key] = ds
        self.cache_times[cache_key] = {
            "expiration": datetime.now() + timedelta(seconds=settings.dataset_cache_timeout),
            "requested": datetime.now()
        }

    # checks if a dataset is loading
    def _is_dataset_loading(self, dataset_id: str):     
        loading_key = self._get_loading_cache_key(dataset_id)

        if loading_key in self.dataset_loading:
            return True
        if self.redis_cache and self.redis_cache.exists(loading_key):
            return True
        
        return False
    
    # sets the flag for a dataset loading in the memory and/or redis cache
    def _set_dataset_loading(self, dataset_id: str, loading: bool):        
        loading_key = self._get_loading_cache_key(dataset_id)

        if loading:
            if settings.use_memory_cache:
                self.dataset_loading[loading_key] = True
            if self.redis_cache is not None:
                # assume datasets will take a maximum of 3 minutes to load
                # TODO - figure out a way to clear redis if system crashed while loading
                self.redis_cache.set(loading_key, "true", ex=180)
        else:
            if loading_key in self.dataset_loading:
                self.dataset_loading.pop(loading_key)
            if self.redis_cache is not None and self.redis_cache.exists(loading_key):
                self.redis_cache.delete(loading_key)

    @staticmethod
    def _get_dataset_cache_key(dataset_id: str):
        return f"dataset-{dataset_id}"

    @staticmethod
    def _get_loading_cache_key(dataset_id: str):
        return f"loading-{dataset_id}"
