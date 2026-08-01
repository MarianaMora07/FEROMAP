from fastapi import APIRouter, Query

from app.api.deps import DbSession, OptionalUser
from app.db.models import UserRole
from app.services.geo_service import collection_points_geojson, sectors_geojson

router = APIRouter(tags=["geo"])


@router.get("/sectors")
def get_sectors(db: DbSession):
    return sectors_geojson(db)


@router.get("/collection-points")
def get_collection_points(
    db: DbSession,
    current_user: OptionalUser = None,
    sector: str | None = Query(default=None),
    min_fill: int | None = Query(default=None, alias="minFill"),
):
    sector_id = None
    if current_user is not None and current_user.role == UserRole.residente:
        sector_id = current_user.sector_id
    return collection_points_geojson(db, sector=sector, min_fill=min_fill, sector_id=sector_id)
