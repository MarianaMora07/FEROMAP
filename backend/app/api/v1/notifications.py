from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, CurrentUser, OperationsStaff, PlannerOrAdmin
from app.db.models import UserRole
from app.services.notification_service import (
    ack_notification,
    list_recent_notifications,
    process_due_outbox,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _driver_scope(user) -> int | None:
    """Filtra por conductor cuando el usuario es conductor; planificador/admin ve todo."""
    if user.role == UserRole.conductor:
        profile = user.driver_profile
        return profile.id if profile is not None else -1
    return None


@router.get("/drivers/recent")
def get_recent_driver_notifications(
    db: DbSession,
    user: CurrentUser,
    _: OperationsStaff,
    limit: int = Query(default=20, ge=1, le=100),
):
    return list_recent_notifications(db, limit=limit, driver_id=_driver_scope(user))


@router.post("/outbox/process")
def post_process_outbox(db: DbSession, _: PlannerOrAdmin):
    """Procesa reintentos pendientes del outbox (también corre en background)."""
    result = process_due_outbox(db)
    db.commit()
    return result


@router.post("/{notification_id}/ack")
def post_ack_notification(notification_id: int, db: DbSession, user: CurrentUser, _: OperationsStaff):
    """Acuse de recibo del conductor para una notificación."""
    try:
        result = ack_notification(db, notification_id, driver_id=_driver_scope(user))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.commit()
    return result
