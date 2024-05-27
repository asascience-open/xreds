from fastapi import Depends
import redis

from xreds.redis import pool as redis_pool


def get_redis():
    return redis.Redis(connection_pool=redis_pool)
