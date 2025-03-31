from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    '''Settings for running xreds'''
    # fsspec compatible url path to the dataset mapping file
    # in either json or yml format
    datasets_mapping_file: str = ''

    # Root path for the service to mount at
    root_path: str = ''

    # Size threshold exporting datasets to local files
    # in MB
    export_threshold: int = 500

    # Timeout for caching datasets in seconds
    dataset_cache_timeout: int = 10 * 60

    # Whether to save datasets into memory after loading
    # NOTE: this memory cache is independent per gunicorn worker
    use_memory_cache: bool = True

    # Number of datasets that can be memory cached per gunicorn worker
    # 0 = unlimited
    memory_cache_num_datasets: int = 0

    # Whether to use redis to cache datasets when possible
    use_redis_cache: bool = False

    # Optional redis host name
    # If not provided, will default to localhost
    redis_host: str = "localhost"

    # Optional redis port number
    # If not provided, will default to 6379
    redis_port: int = 6379


settings = Settings()
