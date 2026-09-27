"""Contratos de KPIs del ciclo planificado → real (Fase 0).

Define los dos contratos JSON compartidos por backend y frontend:

- ``PlanForecast``: lo que el motor prevé para un día (o la semana agregada),
  con línea base y ahorro.
- ``PlanVsReal``: cierre del ciclo comparando lo previsto con lo ejecutado.

Los constructores son tolerantes a objetos parciales (duck-typing) para poder
usarse con modelos ORM o con namespace de prueba, igual que ``waste_generation``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterable, TypedDict


class PlanForecast(TypedDict, total=False):
    """Previsto de un día (o base del previsto semanal)."""

    distanceKm: float
    durationHours: float
    baselineDistanceKm: float | None
    savingPct: float | None
    scheduledPoints: int
    coveredPoints: int
    uncoveredPoints: int
    coveragePct: float | None
    vehicleCount: int


class WeeklyPlanForecast(PlanForecast, total=False):
    """Previsto agregado de la semana, con desglose por día."""

    weekStartDate: str
    days: dict[str, PlanForecast]


class PlanVsReal(TypedDict, total=False):
    """Comparación previsto vs. real de un día.

    Incluye desglose de paradas (completadas/saltadas/pendientes), visitas al
    vertedero, causa por incidencia y motivos de visitas pendientes generadas.
    """

    plannedDistanceKm: float | None
    actualDistanceKm: float | None
    plannedDurationMin: float | None
    actualDurationMin: float | None
    scheduledPoints: int
    servedPoints: int
    completedPoints: int
    skippedPoints: int
    pendingPoints: int
    landfillStops: int
    collectedKg: float
    completionPct: float | None
    incidents: dict[str, Any]
    pendingVisitsByReason: dict[str, int]
    closeStatus: str


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_utc(moment: datetime | None) -> datetime | None:
    if moment is None:
        return None
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def _route_distance_km(route: Any) -> float:
    meters = _as_float(getattr(route, "total_distance_meters", None)) or 0.0
    return meters / 1000.0


def _route_duration_min(route: Any) -> float:
    seconds = _as_float(getattr(route, "estimated_duration_seconds", None)) or 0.0
    return seconds / 60.0


def _saving_pct(baseline_km: float | None, optimized_km: float | None) -> float | None:
    if not baseline_km or not optimized_km or baseline_km <= 0:
        return None
    return round((1 - optimized_km / baseline_km) * 100, 1)


def forecast_from_routes(
    routes: Iterable[Any],
    *,
    scheduled_points: int = 0,
    covered_points: int | None = None,
    uncovered_points: int = 0,
    baseline_distance_km: float | None = None,
) -> PlanForecast:
    """Construye el previsto de un día a partir de las rutas optimizadas."""
    route_list = list(routes)
    distance_km = round(sum(_route_distance_km(route) for route in route_list), 2)
    duration_hours = round(sum(_route_duration_min(route) for route in route_list) / 60.0, 2)
    scheduled = max(0, int(scheduled_points))
    if covered_points is None:
        covered = max(0, scheduled - max(0, int(uncovered_points)))
    else:
        covered = max(0, int(covered_points))
    if scheduled > 0:
        covered = min(covered, scheduled)
    coverage_pct = round(covered / scheduled * 100, 1) if scheduled > 0 else None
    baseline = _as_float(baseline_distance_km)
    return PlanForecast(
        distanceKm=distance_km,
        durationHours=duration_hours,
        baselineDistanceKm=_round(baseline),
        savingPct=_saving_pct(baseline, distance_km),
        scheduledPoints=scheduled,
        coveredPoints=covered,
        uncoveredPoints=max(0, scheduled - covered),
        coveragePct=coverage_pct,
        vehicleCount=len(route_list),
    )


def plan_vs_real_from_routes(
    routes: Iterable[Any],
    *,
    scheduled_points: int = 0,
    actual_distance_km: float | None = None,
    incidents: Iterable[Any] | None = None,
    pending_visits: dict[str, int] | None = None,
    close_status: str | None = None,
) -> PlanVsReal:
    """Cierra el ciclo comparando el previsto (rutas) con lo ejecutado (waypoints).

    Casos borde cubiertos: paradas saltadas (``skipped``), paradas aún pendientes
    al cierre, visitas al vertedero (waypoints ``landfill``, que no cuentan como
    contenedores servidos) y causa por incidencia (``incidents``).
    """
    route_list = list(routes)
    planned_distance_km = (
        round(sum(_route_distance_km(route) for route in route_list), 2) if route_list else None
    )
    planned_duration_min = (
        round(sum(_route_duration_min(route) for route in route_list), 1) if route_list else None
    )

    served = 0
    skipped = 0
    pending = 0
    landfill_stops = 0
    collected_kg = 0.0
    arrivals: list[datetime] = []
    for route in route_list:
        for waypoint in getattr(route, "waypoints", None) or []:
            status = getattr(waypoint, "status", None)
            waypoint_type = getattr(waypoint, "waypoint_type", None) or "collection"
            arrival = _as_utc(getattr(waypoint, "actual_arrival_at", None))
            if arrival is not None:
                arrivals.append(arrival)

            if waypoint_type == "landfill":
                # Descarga en vertedero: no es un contenedor servido.
                if status in {"completed", "collected"}:
                    landfill_stops += 1
                continue

            if status in {"completed", "collected"}:
                served += 1
                # El peso solo cuenta si la parada se sirvió: `collected_weight_kg` se pre-carga
                # con la demanda planificada, y sumarla sin filtrar inflaba «Recolectado» en días
                # sin ejecución (0 puntos servidos y, aun así, toneladas contadas).
                weight = _as_float(getattr(waypoint, "collected_weight_kg", None))
                if weight:
                    collected_kg += weight
            elif status == "skipped":
                skipped += 1
            elif status == "pending":
                pending += 1

    actual_duration_min = None
    if len(arrivals) >= 2:
        actual_duration_min = round((max(arrivals) - min(arrivals)).total_seconds() / 60.0, 1)

    incident_counts: dict[str, int] = {}
    for incident in incidents or []:
        incident_type = str(getattr(incident, "incident_type", None) or "otro")
        incident_counts[incident_type] = incident_counts.get(incident_type, 0) + 1

    scheduled = max(0, int(scheduled_points))
    completion_pct = round(served / scheduled * 100, 1) if scheduled > 0 else None
    return PlanVsReal(
        plannedDistanceKm=planned_distance_km,
        actualDistanceKm=_round(_as_float(actual_distance_km)),
        plannedDurationMin=planned_duration_min,
        actualDurationMin=actual_duration_min,
        scheduledPoints=scheduled,
        servedPoints=served,
        completedPoints=served,
        skippedPoints=skipped,
        pendingPoints=pending,
        landfillStops=landfill_stops,
        collectedKg=round(collected_kg, 2),
        completionPct=completion_pct,
        incidents={"total": sum(incident_counts.values()), "byType": incident_counts},
        pendingVisitsByReason=dict(pending_visits or {}),
        closeStatus=close_status or "",
    )


def aggregate_weekly_forecast(
    by_day: dict[str, PlanForecast],
    *,
    week_start_date: str,
    baseline_distance_km: float | None = None,
) -> WeeklyPlanForecast:
    """Agrega los previstos diarios en el previsto de la semana."""
    days = dict(by_day)
    distance_km = round(sum(_as_float(day.get("distanceKm")) or 0.0 for day in days.values()), 2)
    duration_hours = round(
        sum(_as_float(day.get("durationHours")) or 0.0 for day in days.values()), 2
    )
    scheduled = sum(int(day.get("scheduledPoints") or 0) for day in days.values())
    covered = sum(int(day.get("coveredPoints") or 0) for day in days.values())
    vehicles = sum(int(day.get("vehicleCount") or 0) for day in days.values())
    baseline = _as_float(baseline_distance_km)
    coverage_pct = round(covered / scheduled * 100, 1) if scheduled > 0 else None
    return WeeklyPlanForecast(
        weekStartDate=week_start_date,
        distanceKm=distance_km,
        durationHours=duration_hours,
        baselineDistanceKm=_round(baseline),
        savingPct=_saving_pct(baseline, distance_km),
        scheduledPoints=scheduled,
        coveredPoints=covered,
        uncoveredPoints=max(0, scheduled - covered),
        coveragePct=coverage_pct,
        vehicleCount=vehicles,
        days=days,
    )


def parse_kpi_json(raw: str | None) -> dict[str, Any] | None:
    """Parsea un JSON de KPIs; devuelve ``None`` si no es un objeto válido."""
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def dump_kpi_json(payload: dict[str, Any] | None) -> str | None:
    """Serializa un contrato de KPIs; ``None`` si está vacío."""
    if not payload:
        return None
    return json.dumps(payload, ensure_ascii=False)
