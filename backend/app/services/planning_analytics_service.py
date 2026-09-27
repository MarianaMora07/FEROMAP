"""Analítica de planificación por nivel (directivo / administrativo / operativo)."""

from __future__ import annotations

import csv
import io
import json
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    DailyPlan,
    OptimizedRoute,
    PendingVisit,
    Simulation,
    Vehicle,
    VehicleIncident,
    WeeklyPlan,
)
from app.services.planning_service import week_range


def _parse_date(value: date | str | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _numeric_kpi(value: Any) -> float:
    """Normaliza un KPI que puede venir como número o como contrato {current, optimized}."""
    if isinstance(value, dict):
        value = value.get("optimized", value.get("current"))
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _weekly_scheduled_point_count(plan: WeeklyPlan) -> int:
    point_ids: set[int] = set()
    for day in plan.days:
        if day.collection_point_ids_json:
            point_ids.update(json.loads(day.collection_point_ids_json))
    return len(point_ids)


def _daily_executed_metrics(db: Session, plan: DailyPlan) -> tuple[float, float, int, int]:
    if plan.simulation_id is None:
        return 0.0, 0.0, 0, 0
    simulation = db.get(Simulation, plan.simulation_id)
    if simulation is None:
        return 0.0, 0.0, 0, 0

    distance_km = float(simulation.kpi_total_distance_optimized or 0)
    duration_h = 0.0
    if simulation.parameters_json:
        params = json.loads(simulation.parameters_json)
        kpis = params.get("kpis") or {}
        duration_h = _numeric_kpi(kpis.get("durationHours"))

    routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.daily_plan_id == plan.id)
        .options(joinedload(OptimizedRoute.waypoints))
    ).unique().all()
    visited = 0
    scheduled = 0
    for route in routes:
        for wp in route.waypoints:
            scheduled += 1
            if wp.status == "completed":
                visited += 1
    return distance_km, duration_h, visited, scheduled


def planning_analytics_summary(
    db: Session,
    *,
    week_from: date | None = None,
    week_to: date | None = None,
) -> dict[str, Any]:
    today = date.today()
    if week_to is None:
        week_to = today
    if week_from is None:
        week_from = week_to - timedelta(days=28)

    week_start_from, _ = week_range(week_from)
    _, week_end_to = week_range(week_to)

    weekly_plans = db.scalars(
        select(WeeklyPlan)
        .where(
            WeeklyPlan.week_start_date >= week_start_from,
            WeeklyPlan.week_start_date <= week_end_to,
            WeeklyPlan.status.in_(["approved", "archived"]),
        )
        .options(joinedload(WeeklyPlan.days))
        .order_by(WeeklyPlan.week_start_date)
    ).unique().all()

    daily_plans = db.scalars(
        select(DailyPlan)
        .where(DailyPlan.operation_date >= week_start_from, DailyPlan.operation_date <= week_end_to)
        .order_by(DailyPlan.operation_date)
    ).all()
    daily_by_date = {row.operation_date: row for row in daily_plans}

    # --- Nivel directivo ---
    weeks_tracked = len(weekly_plans) or 1
    closed_days = 0
    scheduled_days = 0
    for plan in weekly_plans:
        for day in plan.days:
            scheduled_days += 1
            daily = daily_by_date.get(day.operation_date)
            if daily and daily.status in {"completed", "partial"}:
                closed_days += 1
    weekly_compliance_pct = round(closed_days / scheduled_days * 100, 1) if scheduled_days else 0.0

    carry_open = db.scalar(
        select(func.count())
        .select_from(PendingVisit)
        .where(PendingVisit.status == "open", PendingVisit.origin_operation_date < week_start_from)
    ) or 0
    carry_total = db.scalar(select(func.count()).select_from(PendingVisit)) or 0
    carry_over_pct = round(carry_open / carry_total * 100, 1) if carry_total else 0.0

    planned_km = 0.0
    planned_hours = 0.0
    for plan in weekly_plans:
        if plan.expected_kpis_json:
            kpis = json.loads(plan.expected_kpis_json)
            planned_km += _numeric_kpi(kpis.get("distanceKm"))
            planned_hours += _numeric_kpi(kpis.get("durationHours"))

    executed_km = 0.0
    executed_hours = 0.0
    visited_total = 0
    scheduled_visits = 0
    for daily in daily_plans:
        km, hours, visited, scheduled = _daily_executed_metrics(db, daily)
        executed_km += km
        executed_hours += hours
        visited_total += visited
        scheduled_visits += scheduled

    visit_compliance_pct = (
        round(visited_total / scheduled_visits * 100, 1) if scheduled_visits else weekly_compliance_pct
    )

    # --- Nivel administrativo ---
    dispatched = sum(1 for row in daily_plans if row.dispatched_at is not None)
    optimized = sum(1 for row in daily_plans if row.simulation_id is not None)
    open_pending = db.scalar(
        select(func.count()).select_from(PendingVisit).where(PendingVisit.status == "open")
    ) or 0

    # --- Nivel operativo ---
    open_incidents = db.scalar(
        select(func.count()).select_from(VehicleIncident).where(VehicleIncident.resolved_at.is_(None))
    ) or 0
    simulations = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(100)
    ).all()
    recalc_count = 0
    for sim in simulations:
        if not sim.parameters_json:
            continue
        params = json.loads(sim.parameters_json)
        ctx = params.get("planningContext") or {}
        if ctx.get("planningLevel") == "operational" or params.get("contingency"):
            recalc_count += 1

    return {
        "range": {
            "weekFrom": week_start_from.isoformat(),
            "weekTo": week_end_to.isoformat(),
        },
        "levels": {
            "directivo": {
                "weeklyCompliancePct": weekly_compliance_pct,
                "visitCompliancePct": visit_compliance_pct,
                "carryOverPct": carry_over_pct,
                "weeksTracked": weeks_tracked,
                "plannedKm": round(planned_km, 1),
                "executedKm": round(executed_km, 1),
                "plannedHours": round(planned_hours, 1),
                "executedHours": round(executed_hours, 1),
                "kmVariancePct": round((executed_km - planned_km) / planned_km * 100, 1) if planned_km else 0.0,
            },
            "administrativo": {
                "dailyPlans": len(daily_plans),
                "optimizedDays": optimized,
                "dispatchedDays": dispatched,
                "openPendingVisits": open_pending,
                "scheduledDays": scheduled_days,
                "closedDays": closed_days,
            },
            "operativo": {
                "openIncidents": open_incidents,
                "operationalRecalcs": recalc_count,
                "routesInProgress": db.scalar(
                    select(func.count())
                    .select_from(OptimizedRoute)
                    .where(OptimizedRoute.status == "in_progress")
                )
                or 0,
            },
        },
        "trends": _planning_trends(db, weekly_plans, daily_plans),
        "planVsReal": plan_vs_real_report(
            db, week_from=week_from, week_to=week_to, limit=200
        )["summary"],
    }


def _planning_trends(
    db: Session,
    weekly_plans: list[WeeklyPlan],
    daily_plans: list[DailyPlan],
) -> dict[str, Any]:
    labels: list[str] = []
    compliance: list[float] = []
    carry_over: list[float] = []
    planned_km_series: list[float] = []
    executed_km_series: list[float] = []

    daily_by_week: dict[str, list[DailyPlan]] = {}
    for daily in daily_plans:
        week_start, _ = week_range(daily.operation_date)
        key = week_start.isoformat()
        daily_by_week.setdefault(key, []).append(daily)

    for plan in weekly_plans:
        key = plan.week_start_date.isoformat()
        labels.append(key)
        week_dailies = daily_by_week.get(key, [])
        closed = sum(1 for row in week_dailies if row.status in {"completed", "partial"})
        scheduled = len(plan.days) or 1
        compliance.append(round(closed / scheduled * 100, 1))

        week_carry = db.scalar(
            select(func.count())
            .select_from(PendingVisit)
            .where(
                PendingVisit.status == "open",
                PendingVisit.origin_operation_date < plan.week_start_date,
            )
        ) or 0
        week_total = db.scalar(
            select(func.count())
            .select_from(PendingVisit)
            .where(PendingVisit.origin_operation_date <= plan.week_end_date)
        ) or 1
        carry_over.append(round(week_carry / week_total * 100, 1))

        planned = 0.0
        if plan.expected_kpis_json:
            planned = _numeric_kpi(_parse_kpi_json(plan.expected_kpis_json).get("distanceKm"))
        executed = 0.0
        for daily in week_dailies:
            km, _, _, _ = _daily_executed_metrics(db, daily)
            executed += km
        planned_km_series.append(round(planned, 1))
        executed_km_series.append(round(executed, 1))

    return {
        "labels": labels,
        "weeklyCompliancePct": compliance,
        "carryOverPct": carry_over,
        "plannedKm": planned_km_series,
        "executedKm": executed_km_series,
    }


def _parse_kpi_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _incidents_by_daily_plan(
    db: Session, plan_ids: list[int]
) -> dict[int, list[dict[str, Any]]]:
    """Incidencias (contingencias) asociadas a cada plan del día, vía sus rutas."""
    if not plan_ids:
        return {}
    rows = db.execute(
        select(OptimizedRoute.daily_plan_id, VehicleIncident, Vehicle)
        .join(VehicleIncident, VehicleIncident.route_id == OptimizedRoute.id)
        .join(Vehicle, Vehicle.id == VehicleIncident.vehicle_id)
        .where(OptimizedRoute.daily_plan_id.in_(plan_ids))
        .order_by(VehicleIncident.reported_at)
    ).all()
    grouped: dict[int, list[dict[str, Any]]] = {}
    for plan_id, incident, vehicle in rows:
        if plan_id is None:
            continue
        grouped.setdefault(int(plan_id), []).append(
            {
                "id": incident.id,
                "vehicleId": vehicle.code,
                "incidentType": incident.incident_type,
                "description": incident.description,
                "reportedAt": incident.reported_at.isoformat() if incident.reported_at else None,
            }
        )
    return grouped


def _contingency_cause(incidents: list[dict[str, Any]]) -> str:
    if not incidents:
        return "none"
    if any(incident.get("incidentType") == "breakdown" for incident in incidents):
        return "breakdown"
    return "other"


def plan_vs_real_report(
    db: Session,
    *,
    week_from: date | None = None,
    week_to: date | None = None,
    limit: int = 60,
) -> dict[str, Any]:
    """Comparación previsto vs. real por día (Fase 5).

    Se apoya en los contratos persistidos `planned_kpis_json` / `actual_kpis_json`
    del plan del día (Fases 0 y 4) y en las contingencias (`VehicleIncident`).
    """
    today = date.today()
    if week_to is None:
        week_to = today
    if week_from is None:
        week_from = week_to - timedelta(days=27)
    start, _ = week_range(week_from)
    _, end = week_range(week_to)

    daily_plans = db.scalars(
        select(DailyPlan)
        .where(
            DailyPlan.operation_date >= start,
            DailyPlan.operation_date <= end,
            DailyPlan.actual_kpis_json.is_not(None),
        )
        .order_by(DailyPlan.operation_date.desc())
        .limit(max(1, limit))
    ).all()

    incidents_by_plan = _incidents_by_daily_plan(db, [plan.id for plan in daily_plans])

    items: list[dict[str, Any]] = []
    deviations: list[float] = []
    completions: list[float] = []
    for plan in daily_plans:
        actual = _parse_kpi_json(plan.actual_kpis_json)
        planned = _parse_kpi_json(plan.planned_kpis_json)
        planned_km = actual.get("plannedDistanceKm")
        if planned_km is None:
            planned_km = planned.get("distanceKm")
        actual_km = actual.get("actualDistanceKm")
        deviation_km = (
            round(float(actual_km) - float(planned_km), 2)
            if actual_km is not None and planned_km is not None
            else None
        )
        deviation_pct = (
            round((float(actual_km) - float(planned_km)) / float(planned_km) * 100, 1)
            if deviation_km is not None and planned_km
            else None
        )
        incidents = incidents_by_plan.get(plan.id, [])
        week_start, _ = week_range(plan.operation_date)
        items.append(
            {
                "dailyPlanId": plan.id,
                "operationDate": plan.operation_date.isoformat(),
                "weekStartDate": week_start.isoformat(),
                "status": plan.status,
                "plannedDistanceKm": round(float(planned_km), 2) if planned_km is not None else None,
                "actualDistanceKm": round(float(actual_km), 2) if actual_km is not None else None,
                "distanceDeviationKm": deviation_km,
                "distanceDeviationPct": deviation_pct,
                "plannedDurationMin": actual.get("plannedDurationMin"),
                "actualDurationMin": actual.get("actualDurationMin"),
                "scheduledPoints": actual.get("scheduledPoints"),
                "servedPoints": actual.get("servedPoints"),
                "completionPct": actual.get("completionPct"),
                "collectedKg": actual.get("collectedKg"),
                "incidents": incidents,
                "cause": _contingency_cause(incidents),
            }
        )
        if deviation_pct is not None:
            deviations.append(deviation_pct)
        if actual.get("completionPct") is not None:
            completions.append(float(actual["completionPct"]))

    summary = {
        "range": {"weekFrom": start.isoformat(), "weekTo": end.isoformat()},
        "days": len(items),
        "avgDistanceDeviationPct": (
            round(sum(deviations) / len(deviations), 1) if deviations else None
        ),
        "avgCompletionPct": (
            round(sum(completions) / len(completions), 1) if completions else None
        ),
        "daysWithIncidents": sum(1 for item in items if item["incidents"]),
    }
    return {"items": items, "summary": summary}


def plan_vs_real_csv(items: list[dict[str, Any]]) -> str:
    """CSV exportable del reporte previsto vs. real (una fila por día)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "fecha",
            "semana",
            "estado",
            "km_previsto",
            "km_real",
            "desviacion_km",
            "desviacion_pct",
            "min_previsto",
            "min_real",
            "puntos_programados",
            "puntos_servidos",
            "cumplimiento_pct",
            "kg_recolectados",
            "causa",
            "incidencias",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.get("operationDate", ""),
                item.get("weekStartDate", ""),
                item.get("status", ""),
                item.get("plannedDistanceKm") if item.get("plannedDistanceKm") is not None else "",
                item.get("actualDistanceKm") if item.get("actualDistanceKm") is not None else "",
                item.get("distanceDeviationKm") if item.get("distanceDeviationKm") is not None else "",
                item.get("distanceDeviationPct") if item.get("distanceDeviationPct") is not None else "",
                item.get("plannedDurationMin") if item.get("plannedDurationMin") is not None else "",
                item.get("actualDurationMin") if item.get("actualDurationMin") is not None else "",
                item.get("scheduledPoints") if item.get("scheduledPoints") is not None else "",
                item.get("servedPoints") if item.get("servedPoints") is not None else "",
                item.get("completionPct") if item.get("completionPct") is not None else "",
                item.get("collectedKg") if item.get("collectedKg") is not None else "",
                item.get("cause", "none"),
                "; ".join(
                    f"{incident.get('incidentType')}:{incident.get('vehicleId')}"
                    for incident in item.get("incidents", [])
                ),
            ]
        )
    return buffer.getvalue()


def planning_dashboard_snapshot(db: Session, *, reference: date | None = None) -> dict[str, Any]:
    ref = reference or date.today()
    week_start, week_end = week_range(ref)

    weekly = db.scalar(
        select(WeeklyPlan)
        .where(
            WeeklyPlan.week_start_date == week_start,
            WeeklyPlan.status.in_(["approved", "draft"]),
        )
        .options(joinedload(WeeklyPlan.days))
    )

    # Sin plan en la semana en curso, el hub refleja la próxima semana planificada
    # (viernes/fin de semana, cuando ya se planificó la semana que entra).
    weekly_is_upcoming = False
    if weekly is None:
        next_week_start, _ = week_range(week_start + timedelta(days=7))
        weekly = db.scalar(
            select(WeeklyPlan)
            .where(
                WeeklyPlan.week_start_date == next_week_start,
                WeeklyPlan.status.in_(["approved", "draft"]),
            )
            .options(joinedload(WeeklyPlan.days))
        )
        weekly_is_upcoming = weekly is not None

    daily = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == ref))
    open_incidents = db.scalar(
        select(func.count()).select_from(VehicleIncident).where(VehicleIncident.resolved_at.is_(None))
    ) or 0
    open_pending = db.scalar(
        select(func.count()).select_from(PendingVisit).where(PendingVisit.status == "open")
    ) or 0

    weekly_block = None
    if weekly:
        weekly_block = {
            "id": weekly.id,
            "weekStartDate": weekly.week_start_date.isoformat(),
            "weekEndDate": weekly.week_end_date.isoformat(),
            "status": weekly.status,
            "daysConfigured": len(weekly.days),
            "scheduledPoints": _weekly_scheduled_point_count(weekly),
            "isUpcoming": weekly_is_upcoming,
        }

    daily_block = None
    if daily:
        final_ids = json.loads(daily.final_point_ids_json or "[]")
        pending_ids = json.loads(daily.pending_point_ids_json or "[]")
        daily_block = {
            "id": daily.id,
            "operationDate": daily.operation_date.isoformat(),
            "status": daily.status,
            "pointCount": len(final_ids),
            "pendingCount": len(pending_ids),
            "dispatched": daily.dispatched_at is not None,
        }

    return {
        "weeklyPlan": weekly_block,
        "dailyPlan": daily_block,
        "openIncidents": open_incidents,
        "openPendingVisits": open_pending,
    }
