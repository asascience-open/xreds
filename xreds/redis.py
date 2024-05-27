import os
from typing import Optional

import redis

from xreds.config import Settings, settings
from xreds.logging import logger


def create_redis_pool(settings: Settings) -> Optional[redis.ConnectionPool]:
    if not settings.use_redis_cache:
        logger.warning("Not using redis cache")
        return None

    redis_host = settings.redis_host
    redis_port = settings.redis_port
    logger.warning(f"Creating redis connection pool for {redis_host}:{redis_port}")
    return redis.ConnectionPool(
        host=redis_host,
        port=redis_port,
        db=0
    )

pool = create_redis_pool(settings=settings)

def get_redis_cache() -> Optional[redis.Redis]:
    if pool is None:
        return None
    return redis.Redis(connection_pool=pool)
