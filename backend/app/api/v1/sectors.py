from fastapi import APIRouter, Query

from app.api.deps import DbSession, OptionalUser, PlannerOrAdmin
from app.db.models import UserRole
from app.schemas.sector import SectorGenerationRateUpdate, SectorUpdate
from app.services.geo_service import collection_points_geojson, sectors_geojson
from app.services.sector_service import (
    list_sectors_with_fill_rate,
    sectors_summary,
    update_sector_fill_rate_factor,
    update_sector_generation_config,
)

router = APIRouter(tags=["geo"])


@router.get("/sectors")
def get_sectors(db: DbSession):
    return sectors_geojson(db)


@router.get("/sectors/fill-rate-factors")
def get_sector_fill_rate_factors(db: DbSession, _user: PlannerOrAdmin):
    """Factores de velocidad de llenado por zona (planner/admin)."""
    return list_sectors_with_fill_rate(db)


@router.get("/sectors/summary")
def get_sectors_summary(db: DbSession, _user: PlannerOrAdmin):
    """Agregado por zona: contenedores, capacidad total y generación efectiva."""
    return sectors_summary(db)


@router.patch("/sectors/{sector_id}/fill-rate-factor")
def patch_sector_fill_rate_factor(
    sector_id: int,
    body: SectorUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return update_sector_fill_rate_factor(db, sector_id, body.fill_rate_factor)


@router.patch("/sectors/{sector_id}/generation-rate")
def patch_sector_generation_rate(
    sector_id: int,
    body: SectorGenerationRateUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    """Configura la generación de la zona (tasa, per cápita y modo de reparto)."""
    return update_sector_generation_config(db, sector_id, body)


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
