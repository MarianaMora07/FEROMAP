"""Recálculo operativo sin avería (contenedor crítico → pendientes restantes del día)."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, DailyPlan, OptimizedRoute, RouteWaypoint
from app.services.geo_service import fill_level_pct
from app.services.notification_service import notify_routes_dispatched
from app.services.optimization_service import run_optimization_engine
from app.services.planning_service import get_daily_plan_execution_context


def _resolve_collection_point(db: Session, collection_point_code: str) -> CollectionPoint:
    point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == collection_point_code))
    if point is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Punto de recolección no encontrado: {collection_point_code}",
        )
    return point


def _resolve_daily_plan(db: Session, *, daily_plan_id: int | None, operation_date: date) -> DailyPlan:
    if daily_plan_id is not None:
        plan = db.get(DailyPlan, daily_plan_id)
    else:
        plan = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay plan del día abierto para recalcular",
        )
    if plan.status in {"completed", "partial"} and plan.closed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El plan del día ya fue cerrado",
        )
    return plan


def collect_remaining_day_point_ids(db: Session, daily_plan_id: int) -> list[int]:
    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
        )
        .options(joinedload(OptimizedRoute.waypoints))
    ).unique().all()
    point_ids: list[int] = []
    for route in routes:
        for waypoint in route.waypoints:
            if waypoint.status == "pending":
                point_ids.append(waypoint.collection_point_id)
    return list(dict.fromkeys(point_ids))


def handle_critical_container_recalc(
    db: Session,
    *,
    collection_point_code: str,
    daily_plan_id: int | None = None,
    operation_date: date | None = None,
) -> dict[str, Any]:
    point = _resolve_collection_point(db, collection_point_code)
    fill_level = fill_level_pct(point)
    if fill_level < 80:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El contenedor {collection_point_code} no está en nivel crítico ({fill_level}%)",
        )

    plan = _resolve_daily_plan(
        db,
        daily_plan_id=daily_plan_id,
        operation_date=operation_date or date.today(),
    )
    remaining_ids = collect_remaining_day_point_ids(db, plan.id)
    if point.id not in remaining_ids:
        remaining_ids.append(point.id)

    if not remaining_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay paradas pendientes restantes para optimizar hoy",
        )

    exec_ctx = get_daily_plan_execution_context(db, plan.id)
    scenario_id = exec_ctx.get("scenarioId") or "critical_bin"
    if fill_level >= 90:
        scenario_id = "critical_bin"

    recalc = run_optimization_engine(
        db,
        scenario_id,
        collection_point_ids=remaining_ids,
        auto_dispatch=True,
        planning_level="operational",
        daily_plan_id=plan.id,
        weekly_plan_id=plan.weekly_plan_id,
        operation_date=plan.operation_date,
        fleet_limit=exec_ctx.get("fleetLimit"),
        contingency_meta={
            "recalcType": "critical_container",
            "collectionPointCode": collection_point_code,
            "collectionPointId": point.id,
            "fillLevel": fill_level,
            "remainingPointsCount": len(remaining_ids),
            "dailyPlanId": plan.id,
        },
        auto_commit=False,
    )

    dispatch = recalc.get("dispatch") or {}
    route_ids = dispatch.get("dispatchedRouteIds") or []
    notifications = notify_routes_dispatched(
        db,
        route_ids,
        event_type="critical_recalc",
    )
    db.commit()

    return {
        "collectionPoint": {
            "code": point.code,
            "fillLevel": fill_level,
            "id": point.id,
        },
        "dailyPlanId": plan.id,
        "operationDate": plan.operation_date.isoformat(),
        "remainingPoints": len(remaining_ids),
        "recalculation": recalc,
        "notifications": notifications,
        "message": (
            f"Recálculo operativo: {len(remaining_ids)} punto(s) pendiente(s) "
            f"reoptimizado(s) incluyendo {collection_point_code}."
        ),
    }
