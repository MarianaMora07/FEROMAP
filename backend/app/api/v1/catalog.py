from fastapi import APIRouter

from app.api.deps import DbSession
from app.services.catalog_service import list_alerts, list_vehicles, monitoring_status

router = APIRouter(tags=["catalog"])


@router.get("/vehicles")
def get_vehicles(db: DbSession):
    return list_vehicles(db)


@router.get("/alerts")
def get_alerts():
    return list_alerts()


@router.get("/monitoring/status")
def get_monitoring_status(db: DbSession):
    return monitoring_status(db)
