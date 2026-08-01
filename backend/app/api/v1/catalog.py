from fastapi import APIRouter

from app.api.deps import DbSession, OptionalUser
from app.services.catalog_service import list_alerts, list_vehicles, monitoring_status

router = APIRouter(tags=["catalog"])


@router.get("/vehicles")
def get_vehicles(db: DbSession):
    return list_vehicles(db)


@router.get("/alerts")
def get_alerts(db: DbSession):
    return list_alerts(db)


@router.get("/monitoring/status")
def get_monitoring_status(db: DbSession, current_user: OptionalUser = None):
    return monitoring_status(db, current_user=current_user)
