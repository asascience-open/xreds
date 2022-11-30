from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import HTTPException


class SPAStaticFiles(StaticFiles):
    '''
    From https://stackoverflow.com/a/73552966
    '''
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            else:
                raise ex