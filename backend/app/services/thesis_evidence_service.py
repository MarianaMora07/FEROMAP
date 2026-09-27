"""Evidencia de la evaluación (tesis) ejecutable desde la API.

Tres piezas que hasta ahora solo existían como recetas `just`; cada una escribe la **misma
caché JSON** en ``DATA_DIR/cache`` que el CLI, de modo que la interfaz y la consola comparten
evidencia (reproducibilidad):

- ``baseline``    → ``phase0-baseline-metrics.json`` — comparativa base vs optimizado (5 escenarios).
- ``statistical`` → ``statistical-validations.json`` — Wilcoxon pareada (familia + Holm).
- ``case_study``  → ``case-study-evidence.json`` — 4 casos demo (Fase 12.7).

Los runners exponen ``on_progress(message, value)``, la firma que espera
:func:`run_contingency_background`. En el API corren **secuenciales** (``workers=1``): el
``fork`` de un pool de procesos dentro de uvicorn con hilos es riesgoso; para lotes existe la
receta `just` con ``--workers``.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Sequence

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.scenarios import SCENARIO_ORDER

logger = logging.getLogger(__name__)

THESIS_BASELINE = "baseline"
THESIS_STATISTICAL = "statistical"
THESIS_CASE_STUDY = "case_study"
THESIS_KINDS: tuple[str, ...] = (THESIS_BASELINE, THESIS_STATISTICAL, THESIS_CASE_STUDY)

THESIS_KIND_LABELS: dict[str, str] = {
    THESIS_BASELINE: "Comparativa base vs optimizado",
    THESIS_STATISTICAL: "Validación estadística",
    THESIS_CASE_STUDY: "Casos de estudio",
}

DEFAULT_BASELINE_ANTS = 12
DEFAULT_BASELINE_ITERATIONS = 20
DEFAULT_STATISTICAL_N_RUNS = 30
# Atajo de iteración (equivale a `just wilcoxon --quick`).
QUICK_STATISTICAL_N_RUNS = 10

_CACHE_FILES: dict[str, str] = {
    THESIS_BASELINE: "phase0-baseline-metrics.json",
    THESIS_STATISTICAL: "statistical-validations.json",
    THESIS_CASE_STUDY: "case-study-evidence.json",
}

ProgressCallback = Callable[[str, int], None]


def thesis_evidence_path(kind: str) -> Path:
    name = _CACHE_FILES.get(kind)
    if name is None:
        raise ValueError(f"Evidencia desconocida: '{kind}'. Válidas: {', '.join(THESIS_KINDS)}.")
    path = Path(settings.data_dir) / "cache" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def load_thesis_evidence(kind: str) -> dict[str, Any] | None:
    """Evidencia guardada en caché (0 CPU); ``None`` si aún no se ha generado."""
    path = thesis_evidence_path(kind)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (TypeError, ValueError, json.JSONDecodeError):
        logger.warning("Evidencia ilegible en %s", path, exc_info=True)
        return None


def _store_thesis_evidence(kind: str, payload: dict[str, Any]) -> None:
    path = thesis_evidence_path(kind)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _progress(on_progress: ProgressCallback | None, message: str, value: int) -> None:
    if on_progress is not None:
        on_progress(message, value)


# --------------------------------------------------------------------------- #
# Comparativa base vs optimizado (phase0-baseline)
# --------------------------------------------------------------------------- #


def _baseline_run_row(scenario_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Fila de la comparativa para un escenario, a partir del resultado del motor."""
    kpis = result["kpis"]
    metrics = kpis.get("engineMetrics") or {}
    current_km = kpis["distanceKm"]["current"]
    optimized_km = kpis["distanceKm"]["optimized"]
    saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0
    return {
        "scenarioId": scenario_id,
        "distanceKm": kpis["distanceKm"],
        "durationHours": kpis["durationHours"],
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
        "uncoveredPointCodes": kpis.get("uncoveredPointCodes", []),
        "co2KgAvoided": kpis.get("co2KgAvoided", 0),
        "fuelLiters": kpis.get("fuelLiters", {}),
        "coveragePct": kpis.get("coveragePct", {}),
        "criticalCoveragePct": kpis.get("criticalCoveragePct", {}),
        "containersServed": kpis.get("containersServed", 0),
        "landfillTrips": kpis.get("landfillTrips", 0),
        "activeVehicles": kpis.get("activeVehicles"),
        "fleetUtilizationPct": kpis.get("fleetUtilizationPct"),
        "maxRouteHours": kpis.get("maxRouteHours"),
        "fairnessIndex": kpis.get("fairnessIndex"),
        "computationSeconds": round(metrics.get("computationSeconds", 0), 1),
        "graphLoadSeconds": round(metrics.get("graphLoadSeconds", 0), 2),
        "acoSeconds": round(metrics.get("acoSeconds", 0), 2),
        "overheadSeconds": round(metrics.get("overheadSeconds", 0), 2),
        "savingPct": saving_pct,
    }


def _baseline_scenario(db: Session, scenario_id: str, *, ants: int, iterations: int) -> dict[str, Any]:
    """Corrida de calentamiento descartada + corrida medida (motor en régimen caliente)."""
    from app.services.optimization_service import run_optimization_engine

    def _once() -> dict[str, Any]:
        result = run_optimization_engine(
            db,
            scenario_id,
            aco_ants=ants,
            aco_iterations=iterations,
            auto_commit=False,
            auto_dispatch=False,
            persist=False,
            reporter=None,
        )
        db.rollback()
        return result

    _once()
    return _baseline_run_row(scenario_id, _once())


def run_baseline_evidence(
    db: Session,
    *,
    on_progress: ProgressCallback | None = None,
    aco_ants: int = DEFAULT_BASELINE_ANTS,
    aco_iterations: int = DEFAULT_BASELINE_ITERATIONS,
    scenario_ids: Sequence[str] | None = None,
    workers: int = 1,
    **_ignored: Any,
) -> dict[str, Any]:
    """Comparativa base vs optimizado de los escenarios del contrato.

    Con ``workers > 1`` cada escenario corre en su proceso (CLI: ``just phase0-baseline``);
    en el API se deja ``workers=1`` por el ``fork`` dentro de uvicorn.
    """
    from app.services.graph_service import warm_road_graph_cache

    targets = list(scenario_ids or SCENARIO_ORDER)
    total = max(len(targets), 1)
    # Grafo y matrices en caliente antes de medir: si no, el primer escenario paga el arranque.
    _progress(on_progress, "Preparando grafo y matrices…", 5)
    warm_road_graph_cache()

    if workers and workers > 1 and len(targets) > 1:
        runs = _baseline_parallel(
            targets,
            ants=aco_ants,
            iterations=aco_iterations,
            workers=workers,
            on_progress=on_progress,
            total=total,
        )
    else:
        runs = []
        for index, scenario_id in enumerate(targets, start=1):
            _progress(
                on_progress,
                f"Escenario {scenario_id} ({index}/{total})",
                5 + int(90 * (index - 1) / total),
            )
            runs.append(
                _baseline_scenario(db, scenario_id, ants=aco_ants, iterations=aco_iterations)
            )

    payload = {
        "kind": THESIS_BASELINE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "acoProfile": {"ants": aco_ants, "iterations": aco_iterations},
        "cacheState": "warm",
        "scenarioIds": targets,
        "runs": runs,
    }
    _store_thesis_evidence(THESIS_BASELINE, payload)
    _progress(on_progress, "Comparativa lista", 100)
    return payload


# Sesión propia por proceso: el ``fork`` hereda el pool de conexiones del padre.
_BASELINE_WORKER_DB: Session | None = None


def _init_baseline_worker() -> None:
    global _BASELINE_WORKER_DB
    from app.db.session import SessionLocal, engine

    engine.dispose(close=False)
    _BASELINE_WORKER_DB = SessionLocal()


def _baseline_worker_task(task: tuple[str, int, int]) -> tuple[str, dict[str, Any]]:
    scenario_id, ants, iterations = task
    assert _BASELINE_WORKER_DB is not None
    return scenario_id, _baseline_scenario(
        _BASELINE_WORKER_DB, scenario_id, ants=ants, iterations=iterations
    )


def _baseline_parallel(
    targets: list[str],
    *,
    ants: int,
    iterations: int,
    workers: int,
    on_progress: ProgressCallback | None,
    total: int,
) -> list[dict[str, Any]]:
    from concurrent.futures import ProcessPoolExecutor, as_completed

    tasks = [(scenario_id, ants, iterations) for scenario_id in targets]
    by_scenario: dict[str, dict[str, Any]] = {}
    with ProcessPoolExecutor(
        max_workers=min(workers, len(tasks)), initializer=_init_baseline_worker
    ) as pool:
        futures = [pool.submit(_baseline_worker_task, task) for task in tasks]
        for done, future in enumerate(as_completed(futures), start=1):
            scenario_id, row = future.result()
            by_scenario[scenario_id] = row
            _progress(
                on_progress,
                f"Escenario {scenario_id} ({done}/{total})",
                5 + int(90 * done / total),
            )
    return [by_scenario[scenario_id] for scenario_id in targets]


# --------------------------------------------------------------------------- #
# Validación estadística (wilcoxon)
# --------------------------------------------------------------------------- #


def run_statistical_evidence(
    db: Session,
    *,
    on_progress: ProgressCallback | None = None,
    n_runs: int = DEFAULT_STATISTICAL_N_RUNS,
    scenario_ids: Sequence[str] | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Wilcoxon pareada base vs optimizado por escenario, con la familia ajustada por Holm."""
    from app.services.statistical_validation import run_statistical_validations

    targets = list(scenario_ids or [SCENARIO_ORDER[0]])
    total = max(len(targets), 1)
    runs = max(5, int(n_runs))

    def on_step(index: int, count: int, label: str) -> None:
        _progress(on_progress, f"{label} ({index}/{count})", 10 + int(85 * (index - 1) / count))

    payload = run_statistical_validations(
        db, scenario_ids=targets, n_runs=runs, workers=1, on_step=on_step
    )
    payload["kind"] = THESIS_STATISTICAL
    # ``family`` ya viene del servicio; se fija el total de corridas por escenario.
    payload["nRuns"] = runs
    _store_thesis_evidence(THESIS_STATISTICAL, payload)
    _progress(on_progress, "Validación lista", 100)
    return payload


# --------------------------------------------------------------------------- #
# Casos de estudio (Fase 12.7)
# --------------------------------------------------------------------------- #


def run_case_study_evidence_batch(
    db: Session,
    *,
    on_progress: ProgressCallback | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Corre los 4 casos demo y devuelve sus filas comparativas (misma tabla que la tesis)."""
    from app.services.case_study_evidence_service import (
        DEFENSE_EVIDENCE_USAGE,
        DEFAULT_CASE_CODES,
        SHARED_DEMO_POINT_CODE,
        run_case_study_evidence,
        run_defense_case_study_evidence,
    )

    total = max(len(DEFAULT_CASE_CODES), 1)
    cases: list[dict[str, Any]] = []
    for index, code in enumerate(DEFAULT_CASE_CODES, start=1):
        _progress(
            on_progress,
            f"Caso {code} ({index}/{total})",
            10 + int(85 * (index - 1) / total),
        )
        # El caso combinatorio (120 puntos) se mide como simulación semanal; el resto como
        # corrida única. Es el mismo reparto que `build_comparative_evidence_markdown`.
        evidence = (
            run_defense_case_study_evidence(db, code)
            if code == "CE-COMBINATORIO"
            else run_case_study_evidence(db, code)
        )
        # API en camelCase (``asdict`` devolvería snake_case del dataclass).
        cases.append(
            {
                "code": evidence.code,
                "name": evidence.name,
                "scenarioId": evidence.scenario_id,
                "simulationId": evidence.simulation_id,
                "pointCount": evidence.point_count,
                "servedPoints": evidence.served_points,
                "uncoveredPoints": evidence.uncovered_points,
                "distanceKm": evidence.distance_km,
                "durationH": evidence.duration_h,
                "savingPct": evidence.saving_pct,
                "routeCount": evidence.route_count,
                "sharedPointDemandKg": evidence.shared_point_demand_kg,
                "sharedPointRoute": evidence.shared_point_route,
                "sharedPointSequence": evidence.shared_point_sequence,
            }
        )

    shared = next((row for row in cases if row["code"] == "CE-UNARE-NORTE"), None)
    payload = {
        "kind": THESIS_CASE_STUDY,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sharedPointCode": SHARED_DEMO_POINT_CODE,
        "usage": DEFENSE_EVIDENCE_USAGE,
        "cases": cases,
        "sharedPoint": (
            {
                "code": SHARED_DEMO_POINT_CODE,
                "demandKg": shared["sharedPointDemandKg"],
                "route": shared["sharedPointRoute"],
                "sequence": shared["sharedPointSequence"],
            }
            if shared is not None
            else None
        ),
    }
    _store_thesis_evidence(THESIS_CASE_STUDY, payload)
    _progress(on_progress, "Casos de estudio listos", 100)
    return payload


# --------------------------------------------------------------------------- #
# Despacho por tipo (lo usa el endpoint de jobs)
# --------------------------------------------------------------------------- #

_RUNNERS: dict[str, Callable[..., dict[str, Any]]] = {
    THESIS_BASELINE: run_baseline_evidence,
    THESIS_STATISTICAL: run_statistical_evidence,
    THESIS_CASE_STUDY: run_case_study_evidence_batch,
}


def thesis_evidence_runner(kind: str) -> Callable[..., dict[str, Any]]:
    runner = _RUNNERS.get(kind)
    if runner is None:
        raise ValueError(f"Evidencia desconocida: '{kind}'. Válidas: {', '.join(THESIS_KINDS)}.")
    return runner
