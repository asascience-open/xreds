from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    '''Settings for running xreds'''
    # fsspec compatible url path to the dataset mapping file
    # in either json or yml format
    datasets_mapping_file: str = ''

    # Root path for the service to mount at
    root_path: str = ''

    # Timeout for caching datasets in seconds
    dataset_cache_timeout: int = 10 * 60

    # Size threshold exporting datasets to local files
    # in MB
    export_threshold: int = 500

    # Whether to use redis to cache datasets when possible
    use_redis_cache: bool = False

    # Optional redis host name
    # If not provided, will default to localhost
    redis_host: str = "localhost"

    # Optional redis port number
    # If not provided, will default to 6379
    redis_port: int = 6379


settings = Settings()
