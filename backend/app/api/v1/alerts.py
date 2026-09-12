from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, PlannerOrAdmin
from app.schemas.alert import AlertStatusUpdate
from app.services.alert_service import (
    list_alert_activity,
    list_alerts_payload,
    update_alert_status,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/activity")
def get_alert_activity(
    db: DbSession,
    _user: CurrentUser,
    limit: int = Query(8, ge=1, le=50),
):
    """Lectura para cualquier rol autenticado; el UI acota por rol (conductor/residente usan demo)."""
    # sync=False: no derivar alertas del estado de contenedores; la vista arranca vacía.
    return list_alert_activity(db, limit=limit, sync=False)


@router.get("")
def get_alerts(
    db: DbSession,
    _user: CurrentUser,
    active_only: bool = Query(True),
    sector: str | None = Query(None),
    vehicle: str | None = Query(None),
):
    """Lectura para cualquier rol autenticado; admite scoping por sector/vehículo (F6)."""
    # sync=False: la vista de alertas solo muestra alertas persistidas (0 en BD limpia).
    return list_alerts_payload(
        db, active_only=active_only, sync=False, sector=sector, vehicle=vehicle
    )


@router.patch("/{alert_id}")
def patch_alert(
    alert_id: str,
    payload: AlertStatusUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return update_alert_status(db, alert_id, payload.status)
