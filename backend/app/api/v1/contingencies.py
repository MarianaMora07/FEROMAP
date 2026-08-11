from fastapi import APIRouter

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
def get_recent_incidents(db: DbSession, _: OperationsStaff):
    return list_recent_incidents(db)


@router.post("/critical-container-recalc")
def recalc_critical_container(body: CriticalContainerRecalcRequest, db: DbSession, _: OperationsStaff):
    return handle_critical_container_recalc(
        db,
        collection_point_code=body.collection_point_code,
        daily_plan_id=body.daily_plan_id,
        operation_date=body.operation_date,
    )
