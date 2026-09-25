"""Simulación guionada del día: secuencia de contingencias precomputada.

Regla derivada (opción A, sin tabla nueva): a partir de las rutas del plan se
guionan dos eventos reproducibles —una avería del vehículo con más paradas y un
contenedor crítico—. Cada evento se resuelve con el **dry-run real** del motor,
encadenando el segundo sobre el plan alternativo del primero, y toda la secuencia
se revierte al terminar (no persiste nada).

El frontend solo anima la secuencia devuelta; no orquesta ACO.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.models import DailyPlan, OptimizedRoute
from app.services.contingency_service import (
    _pick_critical_point_code,
    run_vehicle_breakdown_dry_run,
)
from app.services.operational_recalc_service import run_critical_container_recalc_dry_run
from app.services.route_playback_service import build_daily_route_playback

#: Duración objetivo de la animación en el frontend (~5 min en total).
PLAYBACK_DURATION_MINUTES = 5
#: Fracción de la jornada en que aparecen los eventos guionados (opción A).
BREAKDOWN_AT_FRACTION = 0.35
CRITICAL_AT_FRACTION = 0.70
#: Jornada de referencia si el plan no trae duraciones de ruta.
DEFAULT_OPERATION_MINUTES = 720


def _estimate_operation_minutes(base_routes: list[dict[str, Any]]) -> int:
    """Jornada base ≈ la ruta más larga del día (las rutas corren en paralelo)."""
    durations = [
        int(route.get("totalDurationMinutes") or 0)
        for route in base_routes
        if route.get("stops")
    ]
    durations = [value for value in durations if value > 0]
    return max(durations) if durations else DEFAULT_OPERATION_MINUTES


def _pick_breakdown_vehicle(base_routes: list[dict[str, Any]]) -> str | None:
    """Vehículo con más paradas (su ``vehicleLabel`` es el código del camión)."""
    candidates = [route for route in base_routes if route.get("stops")]
    if not candidates:
        return None
    target = max(candidates, key=lambda route: len(route["stops"]))
    label = target.get("vehicleLabel")
    return str(label) if label else None


def _routes_stop_count(routes: list[dict[str, Any]]) -> int:
    return sum(len(route.get("stops") or []) for route in routes)


def _plan_point_ids(plan: DailyPlan) -> list[int]:
    """Puntos que el día debe servir (los finales de la jornada, o los programados)."""
    ids = json.loads(plan.final_point_ids_json or "[]") or json.loads(
        plan.scheduled_point_ids_json or "[]"
    )
    return [int(value) for value in ids]


def _supersede_plan_routes(db: Session, daily_plan_id: int) -> None:
    """Aparta (en la sesión) todo lo optimizado vigente del día.

    Así las métricas del día (`_day_optimized_distance_km`, `_day_fleet_vehicle_ids`) miden
    solo el plan recalculado bajo el escenario. Nunca se confirma: `build_day_simulation`
    revierte la sesión al terminar.
    """
    db.execute(
        update(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status != "superseded",
        )
        .values(status="superseded")
    )
    db.flush()


def _reoptimize_for_scenario(
    db: Session,
    plan: DailyPlan,
    scenario_id: str,
) -> dict[str, Any] | None:
    """Reoptimiza el día bajo `scenario_id` **en la sesión** y resume el resultado.

    Permite simular un día lluvioso/saturado: el motor recalcula rutas y KPIs con el
    multiplicador de tráfico y el boost de llenado del escenario. Devuelve ``None`` cuando no
    hay nada que recalcular (mismo escenario o día sin puntos), y todo se revierte con el
    rollback final de `build_day_simulation`.
    """
    from app.services.optimization_service import run_optimization_engine
    from app.services.planning_service import get_daily_plan_execution_context
    from app.services.scenario_utils import normalize_scenario_id

    if normalize_scenario_id(scenario_id) == normalize_scenario_id(plan.scenario_id):
        return None

    point_ids = _plan_point_ids(plan)
    if not point_ids:
        return None

    exec_ctx = get_daily_plan_execution_context(db, plan.id)
    _supersede_plan_routes(db, plan.id)
    result = run_optimization_engine(
        db,
        scenario_id,
        collection_point_ids=point_ids,
        fleet_limit=exec_ctx.get("fleetLimit"),
        fleet_by_type=exec_ctx.get("fleetByType"),
        sector_partition=exec_ctx.get("sectorPartition"),
        operation_date=plan.operation_date,
        daily_plan_id=plan.id,
        weekly_plan_id=plan.weekly_plan_id,
        planning_level="administrative",
        auto_dispatch=False,
        auto_commit=False,
    )
    kpis = result.get("kpis") or {}
    scenario = result.get("scenario") or {}
    distance = kpis.get("distanceKm") or {}
    duration = kpis.get("durationHours") or {}
    return {
        "id": result.get("scenarioId") or scenario_id,
        "label": scenario.get("label") or scenario_id,
        "trafficMultiplier": scenario.get("trafficMultiplier"),
        "fillLevelBoost": scenario.get("fillLevelBoost"),
        "distanceKm": distance.get("optimized"),
        "baselineDistanceKm": distance.get("current"),
        "durationHours": duration.get("optimized"),
    }


def _step_metrics(
    raw: dict[str, Any], contingency_type: str
) -> tuple[int, float | None, float | None, float | None]:
    """Extrae reasignados y km (antes/después/delta) del resultado del dry-run."""
    comparison = raw.get("comparison") or {}
    if contingency_type == "breakdown":
        reassigned = int(raw.get("pendingPoints") or comparison.get("reassignedPoints") or 0)
    else:
        reassigned = int(raw.get("remainingPoints") or 0)

    before_km = comparison.get("beforeDistanceKm")
    after_km = comparison.get("afterDistanceKm")
    delta_km = comparison.get("distanceDeltaKm")
    if contingency_type == "critical_container":
        recalc = raw.get("recalculation") or {}
        kpis = recalc.get("kpis") or {}
        candidate = (kpis.get("distanceKm") or {}).get("optimized")
        if candidate is not None:
            after_km = float(candidate)
    return reassigned, before_km, after_km, delta_km


def _stability_pct(reassigned_points: int, base_stops: int) -> float | None:
    """Estabilidad del plan: 1 − paradas reasignadas / paradas del tramo base.

    Acotada a [0, 100]; solo aplica a la avería (en el contenedor crítico el
    motor reoptimiza el resto del día, que no es una reasignación comparable).
    """
    if base_stops <= 0:
        return None
    value = 100 * (1 - reassigned_points / base_stops)
    return round(max(0.0, min(100.0, value)), 1)


def _step_payload(
    *,
    step_id: str,
    at_minutes: int,
    contingency_type: str,
    target: dict[str, Any],
    raw: dict[str, Any],
    base_stops: int,
) -> dict[str, Any]:
    reassigned, before_km, after_km, delta_km = _step_metrics(raw, contingency_type)
    stability = _stability_pct(reassigned, base_stops) if contingency_type == "breakdown" else None
    return {
        "id": step_id,
        "atMinutes": int(at_minutes),
        "type": contingency_type,
        "target": target,
        "alternativeRoutes": raw.get("alternativeRoutes") or [],
        "resolution": raw.get("resolution") or "no_change",
        "droppedPoints": raw.get("droppedPoints") or [],
        "droppedDetails": raw.get("droppedDetails") or [],
        "reassignedPoints": reassigned,
        "beforeDistanceKm": before_km,
        "afterDistanceKm": after_km,
        "distanceDeltaKm": delta_km,
        "baseStops": base_stops,
        "stabilityPct": stability,
        "message": raw.get("message") or "",
    }


def build_day_simulation(
    db: Session,
    daily_plan_id: int,
    scenario_id: str | None = None,
) -> dict[str, Any]:
    """Secuencia guionada y precomputada para animar el día (solo lectura).

    Los eventos se ejecutan en la misma sesión para que el segundo parta del plan
    alternativo del primero; al final se revierte la sesión completa.

    Con `scenario_id` distinto al del plan, primero **reoptimiza el día bajo ese escenario**
    (p. ej. lluvia o saturación) para que la secuencia y el plan base reflejen sus condiciones;
    el resumen del escenario queda en `scenario`.
    """
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan del día no encontrado",
        )

    scenario_summary: dict[str, Any] | None = None
    steps: list[dict[str, Any]] = []
    base_routes: list[dict[str, Any]] = []
    operation_minutes = DEFAULT_OPERATION_MINUTES
    try:
        if scenario_id:
            scenario_summary = _reoptimize_for_scenario(db, plan, scenario_id)

        base_routes = build_daily_route_playback(db, daily_plan_id).get("routes") or []
        operation_minutes = _estimate_operation_minutes(base_routes)

        current_routes = base_routes
        breakdown_vehicle = _pick_breakdown_vehicle(base_routes)
        if breakdown_vehicle:
            breakdown_raw = run_vehicle_breakdown_dry_run(
                db,
                vehicle_id=breakdown_vehicle,
                description="Simulación guionada de avería (dry-run)",
                daily_plan_id=daily_plan_id,
            )
            if (breakdown_raw.get("resolution") or "no_change") != "no_change":
                steps.append(
                    _step_payload(
                        step_id="step-1-breakdown",
                        at_minutes=round(operation_minutes * BREAKDOWN_AT_FRACTION),
                        contingency_type="breakdown",
                        target={"vehicleId": breakdown_vehicle},
                        raw=breakdown_raw,
                        base_stops=_routes_stop_count(current_routes),
                    )
                )
                # El siguiente tramo parte del plan alternativo del paso 1.
                current_routes = breakdown_raw.get("alternativeRoutes") or current_routes

        critical_point = _pick_critical_point_code(db, daily_plan_id)
        if critical_point:
            critical_raw = run_critical_container_recalc_dry_run(
                db,
                collection_point_code=critical_point,
                daily_plan_id=daily_plan_id,
            )
            if critical_raw.get("alternativeRoutes"):
                steps.append(
                    _step_payload(
                        step_id="step-2-critical",
                        at_minutes=round(operation_minutes * CRITICAL_AT_FRACTION),
                        contingency_type="critical_container",
                        target={"pointCode": critical_point},
                        raw=critical_raw,
                        base_stops=_routes_stop_count(current_routes),
                    )
                )
    finally:
        # Toda la secuencia (reoptimización por escenario, incidentes, waypoints, rutas
        # alternativas) vive solo en la sesión: nada de esto debe persistir.
        db.rollback()

    return {
        "dailyPlanId": plan.id,
        "operationDate": plan.operation_date.isoformat(),
        "operationMinutes": operation_minutes,
        "playbackDurationMinutes": PLAYBACK_DURATION_MINUTES,
        "baseRoutes": base_routes,
        "steps": steps,
        "scenario": scenario_summary,
    }
