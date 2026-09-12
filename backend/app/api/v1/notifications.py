from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, OperationsStaff, PlannerOrAdmin
from app.services.notification_service import (
    ack_notification,
    list_recent_notifications,
    process_due_outbox,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/drivers/recent")
def get_recent_driver_notifications(
    db: DbSession,
    _: OperationsStaff,
    limit: int = Query(default=20, ge=1, le=100),
):
    return list_recent_notifications(db, limit=limit)


@router.post("/outbox/process")
def post_process_outbox(db: DbSession, _: PlannerOrAdmin):
    """Procesa reintentos pendientes del outbox (también corre en background)."""
    result = process_due_outbox(db)
    db.commit()
    return result


@router.post("/{notification_id}/ack")
def post_ack_notification(notification_id: int, db: DbSession, _: OperationsStaff):
    """Acuse de recibo del conductor para una notificación."""
    try:
        result = ack_notification(db, notification_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.commit()
    return result
