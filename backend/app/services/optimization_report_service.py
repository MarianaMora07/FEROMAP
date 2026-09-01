"""Reporte legible de optimización real → planes por conductor."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import OptimizedRoute, RouteWaypoint


@dataclass(frozen=True)
class DriverPlanRow:
    route_id: int
    vehicle_code: str
    driver_name: str
    stops: int
    landfill_trips: int
    distance_km: float
    duration_h: float
    status: str
    sample_points: str


@dataclass(frozen=True)
class OptimizationReport:
    scenario_id: str
    simulation_id: int
    summary_rows: list[tuple[str, str]]
    driver_rows: list[DriverPlanRow]
    convergence_rows: list[tuple[int, float, float]]
    markdown: str


def is_plausible_daily_optimization_kpis(kpis: dict[str, Any], point_count: int) -> bool:
    """Espejo de isPlausibleDailyOptimizationKpis (frontend)."""
    safe_points = max(1, point_count)
    max_km = max(120.0, safe_points * 15.0)
    max_hours = max(12.0, safe_points * 0.6 + 2.0)
    opt_km = float(kpis["distanceKm"]["optimized"])
    opt_h = float(kpis["durationHours"]["optimized"])
    return (
        math.isfinite(opt_km)
        and math.isfinite(opt_h)
        and opt_km <= max_km
        and opt_h <= max_hours
    )


def assess_convergence(engine_metrics: dict[str, Any] | None) -> dict[str, Any]:
    """Evalúa si ACO converge (mejora o estabiliza la mejor distancia)."""
    series = list((engine_metrics or {}).get("acoConvergence") or [])
    if len(series) < 2:
        return {
            "ok": False,
            "reason": "serie de convergencia vacía o con un solo punto",
            "first_km": None,
            "last_km": None,
            "improvement_pct": None,
            "stopped_early": (engine_metrics or {}).get("acoStoppedEarly"),
        }

    first_km = float(series[0]["bestDistanceKm"])
    last_km = float(series[-1]["bestDistanceKm"])
    improvement_pct = round((1 - last_km / first_km) * 100, 1) if first_km > 0 else 0.0
    ok = last_km <= first_km + 0.05
    return {
        "ok": ok,
        "reason": "mejora o estabilización" if ok else "distancia final peor que inicial",
        "first_km": first_km,
        "last_km": last_km,
        "improvement_pct": improvement_pct,
        "stopped_early": (engine_metrics or {}).get("acoStoppedEarly"),
        "iterations_run": (engine_metrics or {}).get("acoIterationsRun"),
    }


def fetch_driver_routes_for_simulation(db: Session, simulation_id: int) -> list[OptimizedRoute]:
    return list(
        db.scalars(
            select(OptimizedRoute)
            .where(
                OptimizedRoute.simulation_id == simulation_id,
                OptimizedRoute.route_kind == "optimized",
            )
            .options(
                joinedload(OptimizedRoute.driver),
                joinedload(OptimizedRoute.vehicle),
                joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
            )
            .order_by(OptimizedRoute.id)
        )
        .unique()
        .all()
    )


def _waypoint_codes(waypoints: list[RouteWaypoint], *, limit: int = 4) -> str:
    codes: list[str] = []
    for wp in sorted(waypoints, key=lambda w: w.sequence_order):
        if wp.waypoint_type == "landfill":
            codes.append("VERT")
        elif wp.collection_point is not None and wp.collection_point.code:
            codes.append(wp.collection_point.code)
        if len(codes) >= limit:
            break
    suffix = "…" if len(waypoints) > limit else ""
    return ", ".join(codes) + suffix


def build_driver_plan_rows(routes: list[OptimizedRoute]) -> list[DriverPlanRow]:
    rows: list[DriverPlanRow] = []
    for route in routes:
        waypoints = list(route.waypoints or [])
        collection_stops = sum(1 for wp in waypoints if wp.waypoint_type == "collection")
        landfill_trips = sum(1 for wp in waypoints if wp.waypoint_type == "landfill")
        driver = route.driver
        vehicle = route.vehicle
        driver_name = (
            f"{driver.first_name} {driver.last_name}".strip()
            if driver is not None
            else f"driver#{route.driver_id}"
        )
        vehicle_code = vehicle.code if vehicle is not None else f"veh#{route.vehicle_id}"
        distance_km = float(route.total_distance_meters or 0) / 1000.0
        duration_h = float(route.estimated_duration_seconds or 0) / 3600.0
        rows.append(
            DriverPlanRow(
                route_id=route.id,
                vehicle_code=vehicle_code,
                driver_name=driver_name,
                stops=collection_stops,
                landfill_trips=landfill_trips,
                distance_km=round(distance_km, 1),
                duration_h=round(duration_h, 2),
                status=route.status,
                sample_points=_waypoint_codes(waypoints),
            )
        )
    return rows


def _format_table(headers: list[str], rows: list[list[str]]) -> str:
    widths = [len(h) for h in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))
    lines = [
        "| " + " | ".join(headers[i].ljust(widths[i]) for i in range(len(headers))) + " |",
        "|-" + "-|-".join("-" * widths[i] for i in range(len(headers))) + "-|",
    ]
    for row in rows:
        lines.append(
            "| " + " | ".join(str(row[i]).ljust(widths[i]) for i in range(len(headers))) + " |"
        )
    return "\n".join(lines)


def build_optimization_report(
    result: dict[str, Any],
    routes: list[OptimizedRoute],
) -> OptimizationReport:
    kpis = result["kpis"]
    metrics = result.get("engineMetrics") or kpis.get("engineMetrics") or {}
    convergence = assess_convergence(metrics)
    served = len(result.get("servedPointCodes") or [])
    uncovered = int(kpis.get("uncoveredPoints") or 0)
    total_points = served + uncovered
    current_km = float(kpis["distanceKm"]["current"])
    optimized_km = float(kpis["distanceKm"]["optimized"])
    saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0

    summary_rows = [
        ("Escenario", str(result.get("scenarioId", "—"))),
        ("Simulación", str(result.get("simulationId", "—"))),
        ("Puntos del día", f"{served}/{total_points} cubiertos"),
        ("Sin cubrir", str(uncovered)),
        ("Distancia baseline", f"{current_km:.1f} km"),
        ("Distancia ACO", f"{optimized_km:.1f} km"),
        ("Ahorro distancia", f"{saving_pct:+.1f}%"),
        ("Duración ACO", f"{float(kpis['durationHours']['optimized']):.2f} h"),
        ("CO₂ evitado", f"{float(kpis.get('co2KgAvoided', 0)):.1f} kg"),
        ("Convergencia ACO", f"{convergence.get('first_km')} → {convergence.get('last_km')} km ({convergence.get('improvement_pct'):+.1f}%)"),
        ("Iteraciones ACO", str(metrics.get("acoIterationsRun", "—"))),
        ("Parada temprana", "sí" if metrics.get("acoStoppedEarly") else "no"),
        ("KPIs plausibles (día)", "sí" if is_plausible_daily_optimization_kpis(kpis, total_points) else "no"),
    ]

    driver_rows = build_driver_plan_rows(routes)
    convergence_rows = [
        (
            int(point["iteration"]),
            float(point["bestDistanceKm"]),
            float(point["iterationBestDistanceKm"]),
        )
        for point in (metrics.get("acoConvergence") or [])
    ]

    summary_table = _format_table(["Métrica", "Valor"], [[a, b] for a, b in summary_rows])
    driver_table = _format_table(
        ["Ruta", "Vehículo", "Conductor", "Paradas", "Vert.", "km", "h", "Estado", "Secuencia (muestra)"],
        [
            [
                str(row.route_id),
                row.vehicle_code,
                row.driver_name,
                str(row.stops),
                str(row.landfill_trips),
                f"{row.distance_km:.1f}",
                f"{row.duration_h:.2f}",
                row.status,
                row.sample_points or "—",
            ]
            for row in driver_rows
        ],
    )
    convergence_table = _format_table(
        ["Iter", "Mejor km", "Iter km"],
        [[str(i), f"{best:.3f}", f"{it:.3f}"] for i, best, it in convergence_rows[-8:]],
    )

    markdown = "\n".join(
        [
            "## Resumen optimización",
            "",
            summary_table,
            "",
            "## Plan del día por conductor",
            "",
            driver_table if driver_rows else "_Sin rutas optimizadas persistidas._",
            "",
            "## Convergencia ACO (últimas iteraciones)",
            "",
            convergence_table if convergence_rows else "_Sin serie de convergencia._",
        ]
    )

    return OptimizationReport(
        scenario_id=str(result.get("scenarioId", "")),
        simulation_id=int(result.get("simulationId", 0)),
        summary_rows=summary_rows,
        driver_rows=driver_rows,
        convergence_rows=convergence_rows,
        markdown=markdown,
    )
