from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.services.geo_service import collection_points_geojson, sectors_geojson

router = APIRouter(tags=["geo"])


@router.get("/sectors")
def get_sectors(db: DbSession):
    return sectors_geojson(db)


@router.get("/collection-points")
def get_collection_points(
    db: DbSession,
    sector: str | None = Query(default=None),
    min_fill: int | None = Query(default=None, alias="minFill"),
):
    return collection_points_geojson(db, sector=sector, min_fill=min_fill)
