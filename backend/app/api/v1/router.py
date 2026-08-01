from fastapi import APIRouter

from app.api.v1 import catalog, dashboard, routes, sectors, simulations

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(sectors.router)
api_router.include_router(routes.router)
api_router.include_router(dashboard.router)
api_router.include_router(simulations.router)
api_router.include_router(catalog.router)
