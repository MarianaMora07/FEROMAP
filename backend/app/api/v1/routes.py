from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, OperationsStaff, PlannerOrAdmin
from app.schemas.planning import DailyDispatchRequest
from app.services.geo_service import route_geojson
from app.services.operations_service import (
    advance_active_routes,
    advance_route,
    dispatch_optimized_routes,
)

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("/current")
def get_current_route(db: DbSession):
    return route_geojson(db, "current")


@router.get("/optimized")
def get_optimized_route(db: DbSession):
    return route_geojson(db, "optimized")


@router.post("/dispatch")
def post_dispatch_routes(
    db: DbSession,
    _: PlannerOrAdmin,
    body: DailyDispatchRequest | None = None,
):
    result = dispatch_optimized_routes(db, daily_plan_id=body.daily_plan_id if body else None)
    if body and body.daily_plan_id is not None:
        from app.services.planning_service import mark_daily_plan_dispatched

        mark_daily_plan_dispatched(db, body.daily_plan_id)
    db.commit()
    return result


@router.post("/advance")
def post_advance_routes(db: DbSession, _: OperationsStaff):
    result = advance_active_routes(db)
    db.commit()
    return result


@router.post("/{route_id}/advance")
def post_advance_route(route_id: int, db: DbSession, _: OperationsStaff):
    try:
        result = advance_route(db, route_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    return result
