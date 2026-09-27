"""Configuración por zona (parroquia): instalaciones y ventanas horarias (F8)."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, PlannerOrAdmin
from app.schemas.zone import ParishZoneUpdate
from app.services.zone_config_service import list_zones, update_zone

router = APIRouter(tags=["geo"])


@router.get("/parishes")
def get_parishes(db: DbSession, _user: CurrentUser):
    """Lista las zonas (parroquias) con su configuración operativa."""
    return list_zones(db)


@router.patch("/parishes/{parish_id}/zone")
def patch_parish_zone(
    parish_id: int,
    body: ParishZoneUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    """Configura depósito, vertedero y ventana horaria de una zona (planner/admin)."""
    return update_zone(db, parish_id, body)
