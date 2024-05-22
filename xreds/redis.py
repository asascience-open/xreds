import os

import redis

from xreds.logging import logger


def create_redis(redis_host: str, redis_port: int):
    logger.warning(f"Creating redis connection pool for {redis_host}:{redis_port}")
    return redis.ConnectionPool(
        host=redis_host,
        port=redis_port,
        db=0
    )

pool = create_redis(os.getenv("REDIS_HOST", "localhost"), int(os.getenv("REDIS_PORT", "6379")))
