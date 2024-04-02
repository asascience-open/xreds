from typing import Sequence, Optional

from fastapi import APIRouter, Depends, Response
from xpublish import Dependencies, Plugin, hookimpl


class ExportPlugin(Plugin):

    name: str = 'export'

    dataset_router_prefix: str = '/export'
    dataset_router_tags: Sequence[str] = ['export']

    netcdf_threshold: int = 500

    def __init__(self, netcdf_threshold: Optional[int] = None):
        super().__init__(name='export')
        if netcdf_threshold is not None:
            self.netcdf_threshold = netcdf_threshold

    @hookimpl
    def dataset_router(self, deps: Dependencies):
        router = APIRouter(prefix=self.dataset_router_prefix, tags=list(self.dataset_router_tags))

        @router.get('/{filename}')
        def export(filename: str, dataset=Depends(deps.dataset)):
            if filename.endswith('.nc'):
                # Export netcdf if the size is below our threshold
                mbs = dataset.nbytes / 1024 ** 2
                if mbs < self.netcdf_threshold:
                    nc = dataset.to_netcdf()
                    return Response(
                        content=nc,
                        media_type='application/x-netcdf',
                        headers={'Content-Disposition': f'attachment; filename={filename}', 'Content-Length': str(len(nc))}
                    )
                else:
                    return {'message': f'File too large to export. Limit is {self.netcdf_threshold}MB and the requested file is {mbs}MB'}

            return {'message': 'Unsupported file format'}

        @router.get('/formats')
        def get_formats():
            return {'formats': ['nc']}

        return router
