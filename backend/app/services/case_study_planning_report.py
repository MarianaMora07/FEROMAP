"""Reporte de caso de estudio simulando planificación semanal (Fase 12.7+)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.services.case_study_optimization import (
    get_case_study_by_code,
    prepare_case_study_engine_context,
    resolve_engine_parameters,
)
from app.services.optimization_report_service import (
    build_driver_plan_rows,
    build_optimization_report,
    fetch_driver_routes_for_simulation,
)
from app.services.optimization_service import run_optimization_engine


WORKDAY_LABELS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes")
PLANNING_MODE_THRESHOLD = 25


@dataclass(frozen=True)
class PlanningDayResult:
    day_index: int
    label: str
    operation_date: str
    scheduled_count: int
    inherited_pending_count: int
    optimized_count: int
    uncovered_count: int
    deferred_to_next: int
    distance_km: float
    max_route_hours: float
    route_count: int
    simulation_id: int
    uncovered_codes: tuple[str, ...]
    optimization_result: dict[str, Any] | None = None


def should_use_planning_report(active_point_count: int) -> bool:
    return active_point_count > PLANNING_MODE_THRESHOLD


def split_point_ids_across_workdays(point_ids: list[int], *, workdays: int = 5) -> list[list[int]]:
    buckets: list[list[int]] = [[] for _ in range(workdays)]
    for index, point_id in enumerate(sorted(point_ids)):
        buckets[index % workdays].append(point_id)
    return buckets


def _code_to_id_map(db: Session, point_ids: list[int]) -> dict[str, int]:
    from sqlalchemy import select

    from app.db.models import CollectionPoint

    rows = db.scalars(select(CollectionPoint).where(CollectionPoint.id.in_(point_ids))).all()
    return {row.code: row.id for row in rows}


def _max_route_hours(routes) -> float:
    rows = build_driver_plan_rows(routes)
    if not rows:
        return 0.0
    return max(row.duration_h for row in rows)


def run_weekly_planning_simulation(
    db: Session,
    case_study_code: str,
    *,
    scenario_id: str | None = None,
    week_start: date | None = None,
) -> tuple[Any, list[PlanningDayResult]]:
    study = get_case_study_by_code(db, case_study_code)
    ctx = prepare_case_study_engine_context(db, case_study_id=study.id, collection_point_ids=None)
    engine = resolve_engine_parameters(study, scenario_id=scenario_id)
    start = week_start or date(2030, 3, 4)
    daily_schedule = split_point_ids_across_workdays(ctx.resolved_point_ids)

    pending_ids: list[int] = []
    day_results: list[PlanningDayResult] = []

    for day_index, scheduled_ids in enumerate(daily_schedule):
        inherited = list(pending_ids)
        today_ids = sorted(set(scheduled_ids) | set(inherited))
        operation_date = start + timedelta(days=day_index)

        result = run_optimization_engine(
            db,
            engine.scenario_id,
            case_study_id=study.id,
            collection_point_ids=today_ids,
            operators_shortage=engine.operators_shortage,
            aco_ants=engine.aco_ants,
            aco_iterations=engine.aco_iterations,
            priority_fill_level=engine.priority_fill_level,
            time_window_enabled=engine.time_window_enabled,
            estimated_duration_hours=engine.estimated_duration_hours,
            rain_intensity=engine.rain_intensity,
            waste_level_pct=engine.waste_level_pct,
            planning_level="administrative",
            operation_date=operation_date,
            auto_commit=False,
            auto_dispatch=False,
            reporter=None,
        )

        routes = fetch_driver_routes_for_simulation(db, result["simulationId"])
        report = build_optimization_report(result, routes)
        kpis = result["kpis"]
        served_codes = set(result.get("servedPointCodes") or [])
        code_map = _code_to_id_map(db, today_ids)

        uncovered_codes = tuple(kpis.get("uncoveredPointCodes") or [])
        pending_ids = [
            code_map[code]
            for code in uncovered_codes
            if code in code_map
        ]

        day_results.append(
            PlanningDayResult(
                day_index=day_index,
                label=WORKDAY_LABELS[day_index],
                operation_date=operation_date.isoformat(),
                scheduled_count=len(scheduled_ids),
                inherited_pending_count=len(inherited),
                optimized_count=len(served_codes),
                uncovered_count=len(uncovered_codes),
                deferred_to_next=len(pending_ids) if day_index < len(daily_schedule) - 1 else len(pending_ids),
                distance_km=float(kpis["distanceKm"]["optimized"]),
                max_route_hours=_max_route_hours(routes),
                route_count=len(report.driver_rows),
                simulation_id=int(result["simulationId"]),
                uncovered_codes=uncovered_codes,
                optimization_result=result,
            )
        )

    return study, day_results


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


def build_case_study_planning_report_markdown(
    db: Session,
    case_study_code: str,
    *,
    scenario_id: str | None = None,
) -> str:
    study, day_results = run_weekly_planning_simulation(db, case_study_code, scenario_id=scenario_id)
    active_points = sum(1 for row in study.point_memberships if row.active_in_study)
    engine = resolve_engine_parameters(study, scenario_id=scenario_id)
    workday_h = engine.estimated_duration_hours or 12

    total_optimized = sum(day.optimized_count for day in day_results)
    final_pending = day_results[-1].deferred_to_next if day_results else 0
    remanent_codes = day_results[-1].uncovered_codes if day_results else ()

    lines = [
        f"# Reporte caso de estudio — {study.code} (modo planificación)",
        "",
        f"**Nombre:** {study.name}  ",
        f"**Escenario:** {engine.scenario_id}  ",
        f"**Puntos activos en el caso:** {active_points}  ",
        f"**Jornada de referencia:** {workday_h} h por ruta  ",
        "",
        "Simulación **como en planificación operativa**: los puntos se reparten en **5 días laborables**, "
        "cada día se optimiza con el subconjunto del día + **pendientes** heredados del día anterior. "
        "Lo no cubierto pasa al día siguiente (equivalente a `defer_uncovered` / visitas pendientes).",
        "",
        "## Calendario semanal simulado",
        "",
        _format_table(
            [
                "Día",
                "Fecha",
                "Prog.",
                "Pend. hered.",
                "Cubiertos",
                "Sin cubrir",
                "→ Siguiente",
                "km ACO",
                "Max h/ruta",
                "Rutas",
            ],
            [
                [
                    day.label,
                    day.operation_date,
                    str(day.scheduled_count),
                    str(day.inherited_pending_count),
                    str(day.optimized_count),
                    str(day.uncovered_count),
                    str(day.deferred_to_next if day.day_index < 4 else final_pending),
                    f"{day.distance_km:.1f}",
                    f"{day.max_route_hours:.2f}",
                    str(day.route_count),
                ]
                for day in day_results
            ],
        ),
        "",
        "## Lectura operativa",
        "",
        f"- **Cobertura en la semana:** {total_optimized} visitas ejecutadas en total (puede haber reprogramaciones).",
        f"- **Pendientes al cierre del viernes:** {final_pending} punto(s)."
        + (f" ({', '.join(remanent_codes[:8])}{'…' if len(remanent_codes) > 8 else ''})" if remanent_codes else ""),
        "- **Duración por ruta:** cada fila «Max h/ruta» es el turno de un conductor; "
        f"debe estar ≤ {workday_h} h. La suma de turnos **no** es una jornada única.",
        "",
    ]

    if final_pending == 0:
        lines.append(
            "✅ Tras replanificar en la semana, **no quedan pendientes** — el caso es factible con este reparto."
        )
    else:
        lines.append(
            f"⚠️ Quedan **{final_pending} puntos** para la semana siguiente o para ampliar flota / replanificar."
        )

    lines.extend(
        [
            "",
            "## Detalle último día optimizado",
            "",
        ]
    )

    if day_results:
        last = day_results[-1]
        last_routes = fetch_driver_routes_for_simulation(db, last.simulation_id)
        last_result = last.optimization_result or {
            "scenarioId": engine.scenario_id,
            "simulationId": last.simulation_id,
            "kpis": {
                "distanceKm": {"current": 0, "optimized": last.distance_km},
                "durationHours": {"current": 0, "optimized": last.max_route_hours},
                "uncoveredPoints": last.uncovered_count,
                "uncoveredPointCodes": list(last.uncovered_codes),
                "workdayHours": workday_h,
                "exceedsWorkday": {"optimized": last.max_route_hours > workday_h},
                "co2KgAvoided": 0,
            },
            "servedPointCodes": [],
        }
        detail = build_optimization_report(last_result, last_routes)
        lines.append(detail.markdown)

    lines.extend(
        [
            "",
            "## Metadatos",
            "",
            "```json",
            json.dumps(
                {
                    "caseStudyCode": study.code,
                    "planningMode": True,
                    "workdays": len(day_results),
                    "activePointCount": active_points,
                    "engineParameters": {
                        "scenarioId": engine.scenario_id,
                        "acoAnts": engine.aco_ants,
                        "acoIterations": engine.aco_iterations,
                        "operatorsShortage": engine.operators_shortage,
                        "timeWindowEnabled": engine.time_window_enabled,
                        "priorityFillLevel": engine.priority_fill_level,
                    },
                    "weeklyTotals": {
                        "visitsExecuted": total_optimized,
                        "remainingPending": final_pending,
                    },
                },
                ensure_ascii=False,
                indent=2,
            ),
            "```",
        ]
    )
    return "\n".join(lines)
