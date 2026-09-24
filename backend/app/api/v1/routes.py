from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.api.deps import DbSession, OperationsStaff, PlannerOrAdmin, CurrentUser
from app.config import settings
from app.schemas.planning import DailyDispatchRequest
from app.services.geo_service import route_geojson
from app.services.operations_service import (
    advance_active_routes,
    advance_route,
    confirm_route_stop,
    dispatch_optimized_routes,
)

router = APIRouter(prefix="/routes", tags=["routes"])


class ConfirmStopRequest(BaseModel):
    waypointId: int
    outcome: str  # "visited" | "omitted"
    note: str | None = None


@router.get("/current")
def get_current_route(db: DbSession):
    return route_geojson(db, "current")


@router.get("/optimized")
def get_optimized_route(db: DbSession):
    return route_geojson(db, "optimized")


@router.post("/dispatch")
def post_dispatch_routes(
    request: Request,
    db: DbSession,
    _: PlannerOrAdmin,
    body: DailyDispatchRequest | None = None,
):
    result = dispatch_optimized_routes(
        db,
        daily_plan_id=body.daily_plan_id if body else None,
        idempotency_key=request.headers.get("Idempotency-Key"),
    )
    if body and body.daily_plan_id is not None:
        from app.services.planning_service import mark_daily_plan_dispatched

        mark_daily_plan_dispatched(db, body.daily_plan_id)
    db.commit()
    return result


@router.post("/advance")
def post_advance_routes(db: DbSession, _: OperationsStaff):
    """Avance masivo de flota — **acción de demo** (muta datos de todas las rutas activas).

    En producción queda deshabilitada (`DEMO_ACTIONS_ENABLED=false`); el avance real de
    una parada se hace de forma explícita y auditada con `POST /routes/{id}/advance`.
    """
    if not settings.demo_actions_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Avance masivo de flota deshabilitado (acción de demo). Usa POST /routes/{id}/advance.",
        )
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


@router.post("/{route_id}/confirm-stop")
def post_confirm_stop(
    route_id: int,
    body: ConfirmStopRequest,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    _: OperationsStaff,
):
    """F5b — el conductor marca una parada visitada/omitida (flag off por defecto)."""
    if body.outcome not in {"visited", "omitted"}:
        raise HTTPException(status_code=400, detail="outcome debe ser visited u omitted")
    try:
        result = confirm_route_stop(
            db,
            route_id,
            body.waypointId,
            outcome=body.outcome,
            note=body.note,
            user_id=user.id,
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        code = status.HTTP_403_FORBIDDEN if "deshabilitada" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    db.commit()
    return result
