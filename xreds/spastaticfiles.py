from fastapi.exceptions import HTTPException
from fastapi.staticfiles import StaticFiles

from xreds.logging import logger


class SPAStaticFiles(StaticFiles):
    """
    From https://stackoverflow.com/a/73552966
    """

    async def get_response(self, path: str, scope):
        try:
            if (
                not path.endswith(".js")
                and not path.endswith(".css")
                and not path.endswith(".html")
            ):
                raise HTTPException(status_code=404)
            return await super().get_response(path, scope)
        except HTTPException as ex:
            logger.info(ex)
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            else:
                raise ex
