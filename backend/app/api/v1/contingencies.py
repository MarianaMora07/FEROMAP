from fastapi import APIRouter, Query

from app.api.deps import DbSession, OperationsStaff
from app.schemas.contingency import CriticalContainerRecalcRequest, VehicleBreakdownRequest
from app.services.contingency_service import handle_vehicle_breakdown, list_recent_incidents
from app.services.operational_recalc_service import handle_critical_container_recalc

router = APIRouter(prefix="/contingencies", tags=["contingencies"])


@router.post("/vehicle-breakdown")
def report_vehicle_breakdown(body: VehicleBreakdownRequest, db: DbSession, _: OperationsStaff):
    return handle_vehicle_breakdown(
        db,
        vehicle_id=body.vehicle_id,
        route_id=body.route_id,
        description=body.description,
    )


@router.get("/recent")
def get_recent_incidents(
    db: DbSession,
    _: OperationsStaff,
    vehicle_id: str | None = Query(default=None, alias="vehicleId"),
    hours: int | None = Query(default=None, ge=1, le=168),
    limit: int = Query(default=10, ge=1, le=50),
):
    return list_recent_incidents(
        db,
        limit=limit,
        vehicle_id=vehicle_id,
        hours=hours,
    )


@router.post("/critical-container-recalc")
def recalc_critical_container(body: CriticalContainerRecalcRequest, db: DbSession, _: OperationsStaff):
    return handle_critical_container_recalc(
        db,
        collection_point_code=body.collection_point_code,
        daily_plan_id=body.daily_plan_id,
        operation_date=body.operation_date,
    )
