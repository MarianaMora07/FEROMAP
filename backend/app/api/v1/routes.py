from fastapi import APIRouter

from app.api.deps import DbSession
from app.services.geo_service import route_geojson

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("/current")
def get_current_route(db: DbSession):
    return route_geojson(db, "current")


@router.get("/optimized")
def get_optimized_route(db: DbSession):
    return route_geojson(db, "optimized")
