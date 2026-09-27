"""Artefactos de evidencia Fase 12.7 — casos de estudio aislados."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CaseStudyPoint, CollectionPoint, OptimizedRoute
from app.services.case_study_optimization import (
    get_case_study_by_code,
    prepare_case_study_engine_context,
    resolve_customer_demand,
    resolve_engine_parameters,
)
from app.services.case_study_planning_report import (
    PLANNING_MODE_THRESHOLD,
    build_case_study_planning_report_markdown,
    run_weekly_planning_simulation,
    should_use_planning_report,
)
from app.services.optimization_report_service import (
    build_driver_plan_rows,
    build_optimization_report,
    fetch_driver_routes_for_simulation,
)
from app.services.optimization_service import run_optimization_engine


DEFAULT_CASE_CODES = ("CE-UNARE-NORTE", "CE-UNARE-SUR", "CE-MULTI-VIAJE", "CE-COMBINATORIO")
DEFENSE_EVIDENCE_CASE_CODES = DEFAULT_CASE_CODES
SHARED_DEMO_POINT_CODE = "CNT-006"
DEFENSE_EVIDENCE_USAGE: dict[str, str] = {
    "CE-UNARE-NORTE": "Demo acotada / ensayo rápido",
    "CE-UNARE-SUR": "Evidencia comparativa (aislamiento M:N)",
    "CE-MULTI-VIAJE": "Multi-viaje al vertedero",
    "CE-COMBINATORIO": "Stress test — **solo anexo** (D8, no demo en vivo)",
}
ACO_ANTS = 12
ACO_ITERATIONS = 20


@dataclass(frozen=True)
class CaseStudyRunEvidence:
    code: str
    name: str
    scenario_id: str
    simulation_id: int
    point_count: int
    served_points: int
    uncovered_points: int
    distance_km: float
    duration_h: float
    saving_pct: float
    route_count: int
    shared_point_demand_kg: float | None
    shared_point_route: str | None
    shared_point_sequence: int | None


def _repo_root() -> Path:
    repo_root = os.environ.get("FEROMAP_REPO_ROOT")
    if repo_root:
        return Path(repo_root)
    return Path(__file__).resolve().parents[3]


def evidence_report_path() -> Path:
    return _repo_root() / "docs" / "fase-12" / "evidencia-casos-estudio.md"


def defense_evidence_report_path() -> Path:
    return _repo_root() / "docs" / "fase-b" / "evidencia-demo-defensa.md"


def defense_case_report_dir() -> Path:
    return _repo_root() / "docs" / "fase-b" / "reportes"


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


def _shared_point_route_info(
    db: Session,
    routes: list[OptimizedRoute],
    *,
    point_code: str,
) -> tuple[str | None, int | None]:
    point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == point_code))
    if point is None:
        return None, None

    for route in routes:
        waypoints = sorted(route.waypoints or [], key=lambda row: row.sequence_order)
        for wp in waypoints:
            if wp.waypoint_type != "collection" or wp.collection_point_id != point.id:
                continue
            vehicle = route.vehicle.code if route.vehicle is not None else f"veh#{route.vehicle_id}"
            driver = route.driver
            driver_name = (
                f"{driver.first_name} {driver.last_name}".strip()
                if driver is not None
                else f"driver#{route.driver_id}"
            )
            sequence = sum(
                1
                for row in waypoints
                if row.sequence_order <= wp.sequence_order and row.waypoint_type == "collection"
            )
            return f"{vehicle} / {driver_name}", sequence
    return None, None


def _resolve_shared_point_demand(
    db: Session,
    *,
    case_study_id: int,
    point_code: str,
) -> float | None:
    point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == point_code))
    if point is None:
        return None
    membership = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == case_study_id,
            CaseStudyPoint.collection_point_id == point.id,
            CaseStudyPoint.active_in_study.is_(True),
        )
    )
    if membership is None:
        return None
    ctx = prepare_case_study_engine_context(db, case_study_id=case_study_id, collection_point_ids=None)
    resolved_membership = ctx.memberships_by_point_id.get(point.id)
    if resolved_membership is None:
        return None
    demand, _ = resolve_customer_demand(point, resolved_membership, fill_boost=0.0)
    return float(demand)


def run_case_study_evidence(
    db: Session,
    case_study_code: str,
    *,
    scenario_id: str | None = None,
    shared_point_code: str = SHARED_DEMO_POINT_CODE,
) -> CaseStudyRunEvidence:
    study = get_case_study_by_code(db, case_study_code)
    resolved_scenario = scenario_id or study.default_scenario_id or "normal"

    result = run_optimization_engine(
        db,
        resolved_scenario,
        case_study_id=study.id,
        aco_ants=ACO_ANTS,
        aco_iterations=ACO_ITERATIONS,
        auto_commit=False,
        auto_dispatch=False,
        reporter=None,
    )
    routes = fetch_driver_routes_for_simulation(db, result["simulationId"])
    report = build_optimization_report(result, routes)

    kpis = result["kpis"]
    served = len(result.get("servedPointCodes") or [])
    uncovered = int(kpis.get("uncoveredPoints") or 0)
    current_km = float(kpis["distanceKm"]["current"])
    optimized_km = float(kpis["distanceKm"]["optimized"])
    saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0
    route_info, sequence = _shared_point_route_info(db, routes, point_code=shared_point_code)

    return CaseStudyRunEvidence(
        code=study.code,
        name=study.name,
        scenario_id=str(result.get("scenarioId") or resolved_scenario),
        simulation_id=int(result["simulationId"]),
        point_count=served + uncovered,
        served_points=served,
        uncovered_points=uncovered,
        distance_km=round(optimized_km, 1),
        duration_h=round(float(kpis["durationHours"]["optimized"]), 2),
        saving_pct=saving_pct,
        route_count=len(report.driver_rows),
        shared_point_demand_kg=_resolve_shared_point_demand(
            db, case_study_id=study.id, point_code=shared_point_code
        ),
        shared_point_route=route_info,
        shared_point_sequence=sequence,
    )


def run_case_study_planning_evidence(
    db: Session,
    case_study_code: str,
    *,
    scenario_id: str | None = None,
) -> CaseStudyRunEvidence:
    """Métricas agregadas de la simulación semanal (casos > umbral planificación)."""
    study, day_results = run_weekly_planning_simulation(db, case_study_code, scenario_id=scenario_id)
    engine = resolve_engine_parameters(study, scenario_id=scenario_id)
    active_points = sum(1 for row in study.point_memberships if row.active_in_study)
    total_optimized = sum(day.optimized_count for day in day_results)
    final_pending = day_results[-1].deferred_to_next if day_results else 0
    total_km = sum(day.distance_km for day in day_results)
    max_hours = max((day.max_route_hours for day in day_results), default=0.0)
    total_routes = sum(day.route_count for day in day_results)
    last_sim = day_results[-1].simulation_id if day_results else 0

    return CaseStudyRunEvidence(
        code=study.code,
        name=study.name,
        scenario_id=engine.scenario_id,
        simulation_id=last_sim,
        point_count=active_points,
        served_points=total_optimized,
        uncovered_points=final_pending,
        distance_km=round(total_km, 1),
        duration_h=round(max_hours, 2),
        saving_pct=0.0,
        route_count=total_routes,
        shared_point_demand_kg=None,
        shared_point_route=None,
        shared_point_sequence=None,
    )


def run_defense_case_study_evidence(db: Session, case_study_code: str) -> CaseStudyRunEvidence:
    study = get_case_study_by_code(db, case_study_code)
    active_points = sum(1 for row in study.point_memberships if row.active_in_study)
    if should_use_planning_report(active_points):
        return run_case_study_planning_evidence(db, case_study_code)
    return run_case_study_evidence(db, case_study_code)


def build_case_study_report_markdown(
    db: Session,
    case_study_code: str,
    *,
    scenario_id: str | None = None,
    planning_mode: bool | None = None,
) -> str:
    study = get_case_study_by_code(db, case_study_code)
    active_points = sum(1 for row in study.point_memberships if row.active_in_study)
    use_planning = planning_mode if planning_mode is not None else should_use_planning_report(active_points)

    if use_planning:
        return build_case_study_planning_report_markdown(db, case_study_code, scenario_id=scenario_id)

    resolved_scenario = scenario_id or study.default_scenario_id or "normal"
    engine = resolve_engine_parameters(study, scenario_id=resolved_scenario)

    result = run_optimization_engine(
        db,
        engine.scenario_id,
        case_study_id=study.id,
        operators_shortage=engine.operators_shortage,
        aco_ants=engine.aco_ants or ACO_ANTS,
        aco_iterations=engine.aco_iterations or ACO_ITERATIONS,
        priority_fill_level=engine.priority_fill_level,
        time_window_enabled=engine.time_window_enabled,
        estimated_duration_hours=engine.estimated_duration_hours,
        rain_intensity=engine.rain_intensity,
        waste_level_pct=engine.waste_level_pct,
        auto_commit=False,
        auto_dispatch=False,
        reporter=None,
    )
    routes = fetch_driver_routes_for_simulation(db, result["simulationId"])
    report = build_optimization_report(result, routes)
    driver_rows = build_driver_plan_rows(routes)

    lines = [
        f"# Reporte caso de estudio — {study.code}",
        "",
        f"**Nombre:** {study.name}  ",
        f"**Escenario:** {engine.scenario_id}  ",
        f"**Puntos activos:** {active_points}  ",
        f"**Simulación:** {result['simulationId']}  ",
        f"**Modo:** optimización de un solo día (≤ {PLANNING_MODE_THRESHOLD} pts activos)  ",
        "",
        report.markdown,
        "",
        "## Metadatos del caso (motor)",
        "",
        "```json",
        json.dumps(
            {
                "caseStudyId": result.get("caseStudyId"),
                "caseStudyCode": study.code,
                "servedPointCodes": result.get("servedPointCodes") or [],
                "acoAnts": engine.aco_ants or ACO_ANTS,
                "acoIterations": engine.aco_iterations or ACO_ITERATIONS,
            },
            ensure_ascii=False,
            indent=2,
        ),
        "```",
        "",
        f"_Generado {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
    ]
    if not driver_rows:
        lines.insert(-2, "_Sin rutas: revisar flota disponible o puntos del caso._")
    return "\n".join(lines)


def build_comparative_evidence_markdown(db: Session) -> str:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    runs: list[CaseStudyRunEvidence] = []
    for code in DEFAULT_CASE_CODES:
        if code == "CE-COMBINATORIO":
            runs.append(run_defense_case_study_evidence(db, code))
        else:
            runs.append(run_case_study_evidence(db, code))

    norte = next(row for row in runs if row.code == "CE-UNARE-NORTE")
    sur = next(row for row in runs if row.code == "CE-UNARE-SUR")
    shared = db.scalar(
        select(CollectionPoint)
        .where(CollectionPoint.code == SHARED_DEMO_POINT_CODE)
        .options(joinedload(CollectionPoint.case_study_memberships))
    )

    lines = [
        "# Evidencia casos de estudio — Fase 12.7 (defensa)",
        "",
        f"> Generado automáticamente: **{generated_at}**  ",
        "> Regenerar: `just phase12-evidence`",
        "",
        "## Objetivo",
        "",
        "Demostrar que los casos de estudio son **experimentos aislados**: mismo contenedor físico "
        f"(`{SHARED_DEMO_POINT_CODE}`) puede participar en dos casos con **demandas distintas** y "
        "**rutas distintas**, sin mutar el catálogo global ni otros casos.",
        "",
        "## 1. Aislamiento A vs B (pytest)",
        "",
        "```bash",
        "./scripts/compose.sh exec -T api pytest tests/test_case_study_isolation.py -v",
        "```",
        "",
        "| Test | Verifica |",
        "|------|----------|",
        "| `test_shared_point_has_distinct_demands_per_case_study` | CNT-006 demanda distinta Norte/Sur |",
        "| `test_running_case_study_does_not_mutate_other_case_or_catalog` | Optimizar Norte no toca Sur ni catálogo |",
        "| `test_driver_report_accepts_case_study_flag` | CLI `just case-study-report` |",
        "",
        "## 2. Tabla comparativa (4 casos)",
        "",
        _format_table(
            ["Caso", "Escenario", "Puntos", "Cubiertos", "Pend.", "Dist. ACO (km)", "Duración (h)", "Rutas", "Simulación"],
            [
                [
                    row.code,
                    row.scenario_id,
                    str(row.point_count),
                    str(row.served_points),
                    str(row.uncovered_points),
                    f"{row.distance_km:.1f}",
                    f"{row.duration_h:.2f}",
                    str(row.route_count),
                    str(row.simulation_id),
                ]
                for row in runs
            ],
        ),
        "",
        "> **CE-COMBINATORIO:** métricas de simulación semanal (5 días); km = suma diaria; duración = máx. h/ruta. "
        "No se muestra en la demo en vivo (D8).",
        "",
        "## 3. Mismo punto, dos casos, dos rutas",
        "",
        f"Contenedor compartido **`{SHARED_DEMO_POINT_CODE}`** (M:N entre CE-UNARE-NORTE y CE-UNARE-SUR).",
        "",
    ]

    if shared is not None:
        lines.extend(
            [
                f"- **Coordenadas catálogo:** ({float(shared.latitude):.5f}, {float(shared.longitude):.5f}) — inmutables entre casos",
                f"- **Llenado catálogo:** {float(shared.current_fill_level_kg):.0f} kg / {float(shared.max_capacity_kg):.0f} kg",
                "",
            ]
        )

    lines.extend(
        [
            _format_table(
                ["Caso", f"Demanda {SHARED_DEMO_POINT_CODE} (kg)", "Ruta asignada", "Orden parada"],
                [
                    [
                        norte.code,
                        f"{norte.shared_point_demand_kg:.0f}" if norte.shared_point_demand_kg is not None else "—",
                        norte.shared_point_route or "—",
                        str(norte.shared_point_sequence) if norte.shared_point_sequence is not None else "—",
                    ],
                    [
                        sur.code,
                        f"{sur.shared_point_demand_kg:.0f}" if sur.shared_point_demand_kg is not None else "—",
                        sur.shared_point_route or "—",
                        str(sur.shared_point_sequence) if sur.shared_point_sequence is not None else "—",
                    ],
                ],
            ),
            "",
        ]
    )

    routes_differ = (
        norte.shared_point_route != sur.shared_point_route
        or norte.shared_point_sequence != sur.shared_point_sequence
        or norte.distance_km != sur.distance_km
    )
    demands_differ = (
        norte.shared_point_demand_kg is not None
        and sur.shared_point_demand_kg is not None
        and norte.shared_point_demand_kg != sur.shared_point_demand_kg
    )

    lines.extend(
        [
            "**Lectura para la defensa:**",
            "",
        ]
    )
    if demands_differ:
        lines.append(
            f"- ✅ Demanda distinta en `{SHARED_DEMO_POINT_CODE}`: "
            f"Norte {norte.shared_point_demand_kg:.0f} kg vs Sur {sur.shared_point_demand_kg:.0f} kg "
            "(overrides por caso, catálogo intacto)."
        )
    if routes_differ:
        lines.append(
            "- ✅ Rutas distintas: el ACO reoptimiza con instancias VRP separadas por caso "
            f"(distancia Norte {norte.distance_km:.1f} km vs Sur {sur.distance_km:.1f} km)."
        )
    if not demands_differ and not routes_differ:
        lines.append(
            "- ⚠️ Ejecuta de nuevo tras `just seed`; se esperaban demandas/rutas distintas entre Norte y Sur."
        )

    lines.extend(
        [
            "",
            "## 4. Reporte individual por caso",
            "",
            "```bash",
            "just case-study-report CE-UNARE-NORTE",
            "just case-study-report CE-UNARE-SUR",
            "just case-study-report CE-MULTI-VIAJE",
            "just case-study-report CE-COMBINATORIO",
            "just phase-b-evidence",
            "```",
            "",
            "## 5. Guion oral (3 min)",
            "",
            "Ver [guion-defensa-casos-estudio.md](./guion-defensa-casos-estudio.md).",
            "",
        ]
    )
    return "\n".join(lines)


def build_defense_evidence_markdown(
    db: Session,
    *,
    generated_at: str | None = None,
    report_files: dict[str, str] | None = None,
) -> str:
    """Consolida evidencia B5 → docs/fase-b/evidencia-demo-defensa.md."""
    timestamp = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    runs = [run_defense_case_study_evidence(db, code) for code in DEFENSE_EVIDENCE_CASE_CODES]
    report_files = report_files or {}

    lines = [
        "# Evidencia académica — demo de defensa (Fase B5)",
        "",
        f"> **Generado:** {timestamp}  ",
        "> **Regenerar:** `just phase-b-evidence` (incluye reportes individuales + tabla comparativa)",
        "",
        "**Objetivo (D20–D21):** anexo reproducible con cuatro casos de estudio aislados. "
        "Los tres primeros sustentan la narrativa oral; **CE-COMBINATORIO** documenta escala combinatoria "
        "sin mostrarse en la demo en vivo (D8).",
        "",
        "## 1. Tabla comparativa (4 casos)",
        "",
        _format_table(
            [
                "Caso",
                "Uso en defensa",
                "Escenario",
                "Puntos",
                "Cubiertos",
                "Pend.",
                "km ACO",
                "Max h/ruta",
                "Rutas",
                "Sim.",
            ],
            [
                [
                    row.code,
                    DEFENSE_EVIDENCE_USAGE.get(row.code, "—"),
                    row.scenario_id,
                    str(row.point_count),
                    str(row.served_points),
                    str(row.uncovered_points),
                    f"{row.distance_km:.1f}",
                    f"{row.duration_h:.2f}",
                    str(row.route_count),
                    str(row.simulation_id),
                ]
                for row in runs
            ],
        ),
        "",
        "### Lectura para la tesis",
        "",
        "| Caso | Qué demuestra |",
        "|------|---------------|",
        "| CE-UNARE-NORTE | Subconjunto compacto (15 pts) — baseline vs ACO en escenario `normal`. |",
        "| CE-UNARE-SUR | Mismo catálogo físico, demandas distintas (M:N con Norte vía `CNT-006`). |",
        "| CE-MULTI-VIAJE | Restricción de capacidad y visitas al vertedero (`saturated`). |",
        "| CE-COMBINATORIO | **Stress test** (~120 pts, 5 días simulados): dificultad combinatoria; "
        "`demoVisible: false` en UI; citar solo en anexo / Cap. resultados. |",
        "",
        "> **D8:** no abrir CE-COMBINATORIO durante el guion de 10 min. "
        "Ver [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md).",
        "",
        "## 2. Reportes individuales (regenerables)",
        "",
        "```bash",
        "just case-study-report CE-UNARE-NORTE",
        "just case-study-report CE-UNARE-SUR",
        "just case-study-report CE-MULTI-VIAJE",
        "just case-study-report CE-COMBINATORIO",
        "```",
        "",
        "| Caso | Archivo | Generado |",
        "|------|---------|----------|",
    ]

    for code in DEFENSE_EVIDENCE_CASE_CODES:
        rel_path = report_files.get(code, f"reportes/{code}.md")
        file_ts = report_files.get(f"{code}:timestamp", timestamp)
        lines.append(f"| {code} | [{rel_path}](./{rel_path}) | {file_ts} |")

    combinatorio = next(row for row in runs if row.code == "CE-COMBINATORIO")
    lines.extend(
        [
            "",
            f"**CE-COMBINATORIO** usa modo planificación semanal ({combinatorio.point_count} puntos activos, "
            f"umbral > {PLANNING_MODE_THRESHOLD}). Métricas: {combinatorio.served_points} visitas en la semana simulada, "
            f"{combinatorio.uncovered_points} pendiente(s) al cierre, {combinatorio.distance_km:.1f} km ACO acumulados.",
            "",
            "## 3. Aislamiento entre casos (pytest)",
            "",
            "```bash",
            "just test-case-study-isolation",
            "```",
            "",
            "Detalle ampliado: [evidencia-casos-estudio.md](../fase-12/evidencia-casos-estudio.md) "
            "(sección CNT-006 Norte vs Sur).",
            "",
            "## 4. Capturas opcionales (anexo visual)",
            "",
            "Si se incluyen en la tesis, guardar en `docs/fase-b/capturas/` con el prefijo del caso:",
            "",
            "| Archivo sugerido | Contenido |",
            "|------------------|-----------|",
            "| `capturas/CE-UNARE-NORTE-kpis.png` | Paso 3 simulación — KPIs baseline vs ACO |",
            "| `capturas/CE-MULTI-VIAJE-rutas.png` | Mapa multi-viaje al vertedero |",
            "| `capturas/CE-COMBINATORIO-semanal.png` | Tabla semanal del reporte planificación |",
            "",
            "_Las capturas no se generan automáticamente; son opcionales para el PDF de anexo._",
            "",
            "## 5. Referencias",
            "",
            "- [alcance-demo-defensa.md](./alcance-demo-defensa.md) — §8 casos de estudio",
            "- [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md) — demo en vivo",
            "- [guion-defensa-casos-estudio.md](../fase-12/guion-defensa-casos-estudio.md) — guion oral 3 min",
            "- `data/seeds/case_studies.json` — definición de casos",
            "",
        ]
    )
    return "\n".join(lines)


def write_defense_case_reports(db: Session) -> dict[str, str]:
    """Escribe reportes markdown por caso y devuelve metadatos para la tabla B5."""
    out_dir = defense_case_report_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    metadata: dict[str, str] = {}
    for code in DEFENSE_EVIDENCE_CASE_CODES:
        markdown = build_case_study_report_markdown(db, code)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        if "_Generado " not in markdown and "_Regenerado " not in markdown:
            markdown = markdown.rstrip() + f"\n\n_Regenerado {timestamp}_\n"
        rel = f"reportes/{code}.md"
        path = out_dir / f"{code}.md"
        path.write_text(markdown, encoding="utf-8")
        metadata[code] = rel
        metadata[f"{code}:timestamp"] = timestamp
    return metadata
