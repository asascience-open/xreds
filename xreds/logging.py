import logging
import os

from contextlib import asynccontextmanager
from fastapi import FastAPI

logger = logging.getLogger("uvicorn")

def configure_app_logger():
    gunicorn_logger = logging.getLogger('gunicorn.error')
    logger.handlers = gunicorn_logger.handlers
    if "gunicorn" in os.environ.get("SERVER_SOFTWARE", ""):
        log_level = gunicorn_logger.level
    else:
        log_level = logging.DEBUG

    logger.setLevel(log_level)

@asynccontextmanager
async def configure_fastapi_logger(app: FastAPI):
    configure_app_logger()
    yield