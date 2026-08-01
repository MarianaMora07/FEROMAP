from fastapi import APIRouter, Query, Response, status

from app.api.deps import DbSession, OptionalUser, PlannerOrAdmin
from app.schemas.vehicle import VehicleUpdate
from app.services.catalog_service import list_alerts, monitoring_status
from app.services.vehicle_service import (
    export_vehicles_csv,
    list_vehicles,
    update_vehicle,
    vehicle_detail,
    vehicle_maintenance_history,
    vehicles_optimization_context,
    vehicles_summary,
)

router = APIRouter(tags=["catalog"])


@router.get("/vehicles/summary")
def get_vehicles_summary(db: DbSession):
    return vehicles_summary(db)


@router.get("/vehicles/optimization-context")
def get_vehicles_optimization_context(db: DbSession):
    return vehicles_optimization_context(db)


@router.get("/vehicles/export")
def export_vehicles(
    db: DbSession,
    _user: PlannerOrAdmin,
    format: str = Query("csv", pattern="^csv$"),
    status: str | None = Query(default=None),
    assignable: bool = Query(default=False),
    q: str | None = Query(default=None),
):
    csv_content = export_vehicles_csv(
        db,
        status=status or None,
        assignable_only=assignable,
        q=q,
    )
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="feromap-vehiculos.csv"'},
    )


@router.get("/vehicles/{code}/incidents")
def get_vehicle_incidents(db: DbSession, code: str):
    return vehicle_maintenance_history(db, code)


@router.get("/vehicles/{code}")
def get_vehicle(db: DbSession, code: str):
    return vehicle_detail(db, code)


@router.patch("/vehicles/{code}")
def patch_vehicle(
    code: str,
    payload: VehicleUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return update_vehicle(db, code, payload)


@router.get("/vehicles")
def get_vehicles(db: DbSession):
    return list_vehicles(db)


@router.get("/alerts")
def get_alerts(db: DbSession):
    return list_alerts(db)


@router.get("/monitoring/status")
def get_monitoring_status(db: DbSession, current_user: OptionalUser = None):
    return monitoring_status(db, current_user=current_user)
