from fastapi import APIRouter

from app.api.deps import DbSession, OperationsStaff
from app.schemas.contingency import VehicleBreakdownRequest
from app.services.contingency_service import handle_vehicle_breakdown, list_recent_incidents

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
