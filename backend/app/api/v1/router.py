from fastapi import APIRouter

from app.api.v1 import (
    admin,
    alerts,
    analytics,
    auth,
    catalog,
    collection_points,
    contingencies,
    dashboard,
    drivers,
    profile,
    reports,
    resident,
    routes,
    sectors,
    simulations,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(drivers.router)
api_router.include_router(admin.router)
api_router.include_router(alerts.router)
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(contingencies.router)
api_router.include_router(sectors.router)
api_router.include_router(collection_points.router)
api_router.include_router(routes.router)
api_router.include_router(dashboard.router)
api_router.include_router(simulations.router)
api_router.include_router(catalog.router)
api_router.include_router(reports.router)
api_router.include_router(analytics.router)
api_router.include_router(resident.router)
