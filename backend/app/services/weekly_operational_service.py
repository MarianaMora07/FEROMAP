"""Generación del plan operativo semanal (camión × día) en lotes secuenciales.

Flujo: tras aprobar el plan semanal, un job de fondo optimiza cada día laborable
(Lun→Vie) con el motor real, persiste las rutas en el plan del día (sin despachar)
y guarda un resumen camión × día en ``weekly_plans.operational_plan_json``.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    CollectionPoint,
    DailyPlan,
    OptimizedRoute,
    RouteWaypoint,
    WeeklyPlan,
)

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int], None]

WORKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def _json_int_list(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [int(item) for item in parsed]
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _fleet_by_type(plan: WeeklyPlan) -> dict[str, int] | None:
    raw = plan.fleet_by_type_json
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    resolved: dict[str, int] = {}
    for key, count in parsed.items():
        if isinstance(count, bool) or not isinstance(count, int) or count < 1:
            continue
        resolved[str(key)] = count
    return resolved or None


def _route_vehicle_rows(db: Session, daily_plan_id: int) -> list[dict[str, Any]]:
    """Rutas optimizadas vigentes (pending) del plan del día, por camión."""
    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status == "pending",
        )
        .options(joinedload(OptimizedRoute.vehicle), joinedload(OptimizedRoute.driver))
        .order_by(OptimizedRoute.id)
    ).unique().all()
    rows: list[dict[str, Any]] = []
    for route in routes:
        stops = int(
            db.scalar(
                select(func.count())
                .select_from(RouteWaypoint)
                .where(
                    RouteWaypoint.route_id == route.id,
                    RouteWaypoint.waypoint_type == "collection",
                )
            )
            or 0
        )
        driver = route.driver
        rows.append(
            {
                "vehicleCode": route.vehicle.code if route.vehicle else "—",
                "driverName": f"{driver.first_name} {driver.last_name}".strip()
                if driver
                else None,
                "distanceKm": round(float(route.total_distance_meters or 0) / 1000, 1),
                "durationMin": round((route.estimated_duration_seconds or 0) / 60),
                "stops": stops,
            }
        )
    return rows


def _collect_engine_context(
    db: Session,
    plan: WeeklyPlan,
    day: Any,
    daily_plan_id: int,
    *,
    point_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Reúne escenario/flota/partición igual que el flujo diario operativo."""
    if point_ids is None:
        from app.services.planning_service import consolidate_daily_points

        point_ids = consolidate_daily_points(db, daily_plan_id)
    scenario_id = day.scenario_id_override or plan.scenario_id
    return {
        "pointIds": point_ids,
        "scenarioId": scenario_id,
        "fleetByType": _fleet_by_type(plan),
        "fleetLimit": day.expected_vehicle_count,
        "sectorPartition": False if _json_int_list(day.sector_ids_json) else None,
    }


def _prepare_draft_daily_plan(
    db: Session, plan: WeeklyPlan, day: Any
) -> tuple[int, list[int]]:
    """Prepara el plan del día de un borrador semanal (revisión antes de aprobar).

    No usa ``open_daily_plan``/``resolve_scheduled_point_ids`` (que exigen semana
    aprobada): resuelve los puntos desde el propio plan y asocia el ``DailyPlan``
    al plan semanal en borrador. Devuelve ``(daily_plan_id, point_ids)``.
    """
    from app.db.models import PendingVisit
    from app.services.case_study_planning import resolve_weekly_day_point_ids

    operation_date = day.operation_date
    resolved_ids, _source, _case = resolve_weekly_day_point_ids(db, plan, day)
    pending_ids = [
        visit.collection_point_id
        for visit in db.scalars(
            select(PendingVisit)
            .where(
                PendingVisit.status == "open",
                (PendingVisit.target_operation_date.is_(None))
                | (PendingVisit.target_operation_date == operation_date),
            )
            .order_by(PendingVisit.priority.desc(), PendingVisit.id)
        ).all()
    ]
    final_ids = sorted(set(resolved_ids) | set(pending_ids))

    daily = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if daily is None:
        daily = DailyPlan(
            operation_date=operation_date,
            weekly_plan_id=plan.id,
            weekly_plan_day_id=day.id,
            status="draft",
            scenario_id=day.scenario_id_override or plan.scenario_id,
            scheduled_point_ids_json=json.dumps(resolved_ids),
            pending_point_ids_json=json.dumps(pending_ids),
            final_point_ids_json=json.dumps(final_ids),
        )
        db.add(daily)
        db.flush()
    else:
        daily.weekly_plan_id = plan.id
        daily.weekly_plan_day_id = day.id
        daily.scheduled_point_ids_json = json.dumps(resolved_ids)
        daily.pending_point_ids_json = json.dumps(pending_ids)
        daily.final_point_ids_json = json.dumps(final_ids)
    return daily.id, final_ids


def generate_weekly_operational_plan(
    db: Session,
    plan_id: int,
    *,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Optimiza la semana día por día y persiste el resumen camión × día."""
    from app.services.optimization_service import run_optimization_engine
    from app.services.planning_service import open_daily_plan

    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.id == plan_id)
        .options(joinedload(WeeklyPlan.days))
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status not in ("draft", "approved"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede generar el plan operativo de un borrador o de una semana aprobada",
        )

    days = sorted(
        (day for day in plan.days if day.operation_date.weekday() <= 4),
        key=lambda day: day.operation_date,
    )
    if not days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El plan semanal no tiene días laborables configurados",
        )

    # Seguridad: no regenerar si algún día ya fue notificado/despachado.
    dispatched_dates = db.scalars(
        select(DailyPlan.operation_date).where(
            DailyPlan.weekly_plan_id == plan.id,
            DailyPlan.status == "dispatched",
        )
    ).all()
    if dispatched_dates:
        dates = ", ".join(sorted(date.isoformat() for date in dispatched_dates))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede regenerar: el día "
                + dates
                + " ya fue notificado a conductores. Cierra esos días antes de regenerar."
            ),
        )

    total = len(days)
    result_rows: list[dict[str, Any]] = []

    def report(day_index: int, message: str) -> None:
        if on_progress is not None:
            base = int((day_index - 1) * 100 / max(1, total))
            on_progress(message, base)

    for index, day in enumerate(days, start=1):
        label = WORKDAY_LABELS[day.operation_date.weekday()]
        day_summary: dict[str, Any] = {
            "operationDate": day.operation_date.isoformat(),
            "weekday": day.weekday,
            "status": "skipped",
        }
        try:
            report(index, f"{label} {day.operation_date} · preparando ({index}/{total})")
            if plan.status == "approved":
                daily = open_daily_plan(db, day.operation_date)
                daily_plan_id = daily["id"]
                ctx = _collect_engine_context(db, plan, day, daily_plan_id)
            else:
                daily_plan_id, final_ids = _prepare_draft_daily_plan(db, plan, day)
                ctx = _collect_engine_context(db, plan, day, daily_plan_id, point_ids=final_ids)
            if not ctx["pointIds"]:
                day_summary.update({"status": "skipped", "reason": "sin puntos"})
                result_rows.append(day_summary)
                if on_progress is not None:
                    on_progress(
                        f"{label} {day.operation_date} · sin puntos",
                        int(index * 100 / max(1, total)),
                    )
                continue

            report(index, f"{label} {day.operation_date} · optimizando con ACO ({index}/{total})")
            result = run_optimization_engine(
                db,
                ctx["scenarioId"],
                collection_point_ids=ctx["pointIds"],
                fleet_limit=ctx["fleetLimit"],
                fleet_by_type=ctx["fleetByType"],
                sector_partition=ctx["sectorPartition"],
                auto_commit=True,
                auto_dispatch=False,
                reporter=None,
                planning_level="administrative",
                weekly_plan_id=plan.id,
                daily_plan_id=daily_plan_id,
                operation_date=day.operation_date,
            )

            kpis = result["kpis"]
            served = int(kpis.get("containersServed") or 0) or len(result.get("servedPointCodes") or [])
            current_day = db.get(DailyPlan, daily_plan_id)
            day_summary.update(
                {
                    "dailyPlanId": daily_plan_id,
                    "simulationId": result.get("simulationId"),
                    "status": current_day.status if current_day else "optimized",
                    "pointCount": len(ctx["pointIds"]),
                    "servedPoints": served,
                    "uncoveredPoints": int(kpis.get("uncoveredPoints") or 0),
                    "distanceKm": round(kpis["distanceKm"]["optimized"], 1),
                    "durationHours": round(float(kpis["durationHours"]["optimized"]), 2),
                    "vehicles": _route_vehicle_rows(db, daily_plan_id),
                }
            )
            if on_progress is not None:
                on_progress(
                    f"{label} {day.operation_date} · listo ({index}/{total})",
                    int(index * 100 / max(1, total)),
                )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.exception("Fallo al generar plan operativo del día %s", day.operation_date)
            day_summary.update({"status": "error", "error": str(exc)})
        result_rows.append(day_summary)

    summary: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "weekStartDate": plan.week_start_date.isoformat(),
        "fleetByType": _fleet_by_type(plan),
        "days": result_rows,
    }
    plan.operational_plan_json = json.dumps(summary, ensure_ascii=False)
    db.commit()
    return summary


def notify_weekly_operational_days(db: Session, plan_id: int) -> list[dict[str, Any]]:
    """Notifica (despacha) todos los días optimizados de la semana.

    Idempotente: solo procesa días cuyo DailyPlan está en estado ``optimized``.
    Días ya notificados o cerrados se omiten.
    """
    from app.services.notification_service import notify_routes_dispatched
    from app.services.operations_service import dispatch_optimized_routes
    from app.services.planning_service import mark_daily_plan_dispatched

    plan = db.get(WeeklyPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")

    days = db.scalars(
        select(DailyPlan)
        .where(
            DailyPlan.weekly_plan_id == plan.id,
            DailyPlan.status == "optimized",
        )
        .order_by(DailyPlan.operation_date)
    ).all()

    notified: list[dict[str, Any]] = []
    for day in days:
        result = dispatch_optimized_routes(db, daily_plan_id=day.id)
        mark_daily_plan_dispatched(db, day.id)
        notify_routes_dispatched(db, result.get("dispatchedRouteIds") or [])
        notified.append(
            {
                "operationDate": day.operation_date.isoformat(),
                "status": "dispatched",
                "dailyPlanId": day.id,
                "dispatchedRouteIds": result.get("dispatchedRouteIds") or [],
            }
        )
        db.flush()
    return notified
