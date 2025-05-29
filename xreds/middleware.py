import asyncio
from fastapi import Request, Response
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware, IdentityResponder
from xreds.logging import logger

# taken from https://github.com/fastapi/fastapi/discussions/11360
# TODO - this will probably work much better once we asynchronize all of the requests
class RequestCancelledMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        queue = asyncio.Queue()

        async def message_poller(sentinel, handler_task):
            while True:
                message = await request.receive()
                if message["type"] == "http.disconnect":
                    handler_task.cancel()
                    return sentinel
                
                await queue.put(message)

        sentinel = object()
        handler_task = asyncio.create_task(call_next(request))
        asyncio.create_task(message_poller(sentinel, handler_task))

        try:
            return await handler_task
        except asyncio.CancelledError:
            logger.warning(f"Attempt to cancel request: {request.scope['path']}?{request.scope['query_string'].decode()}")
            return Response(status_code=200)

# modified from https://github.com/encode/starlette/blob/master/starlette/middleware/gzip.py
class WmsGZipMiddleware(GZipMiddleware):
    def __init__(self, *args):
        super().__init__(*args)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":  # pragma: no cover
            await self.app(scope, receive, send)
            return

        if scope.get("path", "").lower().rstrip("/").split("/")[-1] == "wms":
            return await super().__call__(scope, receive, send)
        else:
            responder = IdentityResponder(self.app, self.minimum_size)
            return await responder(scope, receive, send)
