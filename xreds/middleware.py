import asyncio
from fastapi import Request, Response
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
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
            logger.warning(f"Cancelled request: {request.scope["path"]}{request.scope["query_string"].decode()}")
            return Response(status_code=200)