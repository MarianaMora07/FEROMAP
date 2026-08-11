from fastapi import APIRouter

from app.api.deps import DbSession, OperationsStaff
from app.services.notification_service import list_recent_notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/drivers/recent")
def get_recent_driver_notifications(db: DbSession, _: OperationsStaff):
    return list_recent_notifications(db)
