from fastapi import APIRouter, Query

from app.api.deps import DbSession, PlannerOrAdmin
from app.schemas.alert import AlertStatusUpdate
from app.services.alert_service import (
    list_alert_activity,
    list_alerts_payload,
    update_alert_status,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/activity")
def get_alert_activity(db: DbSession, _user: PlannerOrAdmin, limit: int = Query(8, ge=1, le=50)):
    return list_alert_activity(db, limit=limit)


@router.get("")
def get_alerts(
    db: DbSession,
    _user: PlannerOrAdmin,
    active_only: bool = Query(True),
):
    return list_alerts_payload(db, active_only=active_only)


@router.patch("/{alert_id}")
def patch_alert(
    alert_id: str,
    payload: AlertStatusUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return update_alert_status(db, alert_id, payload.status)
