"""Genera KPIs de referencia Fase 0: 5 escenarios × perfil ACO estándar.

Corre los escenarios en paralelo por proceso (``--workers``); cada proceso hace una corrida de
calentamiento descartada y una medida, para que ``computationSeconds`` refleje el motor en
régimen caliente y no el arranque en frío.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.domain.scenarios import SCENARIO_ORDER
from app.services.graph_service import warm_road_graph_cache
from app.services.optimization_service import run_optimization_engine
from app.services.worker_pool import default_workers

PHASE0_SCENARIOS = SCENARIO_ORDER
DEFAULT_ANTS = 12
DEFAULT_ITERATIONS = 20


def _output_path() -> Path:
    path = Path(settings.data_dir) / "cache" / "phase0-baseline-metrics.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _run_scenario(
    db: Session,
    scenario_id: str,
    *,
    aco_ants: int,
    aco_iterations: int,
) -> dict[str, Any]:
    result = run_optimization_engine(
        db,
        scenario_id,
        aco_ants=aco_ants,
        aco_iterations=aco_iterations,
        auto_commit=False,
        auto_dispatch=False,
        persist=False,
        reporter=None,
    )
    db.rollback()
    return result


def _run_dict(scenario_id: str, result: dict[str, Any]) -> dict:
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
        "computationSeconds": round(metrics.get("computationSeconds", 0), 1),
        "graphLoadSeconds": round(metrics.get("graphLoadSeconds", 0), 2),
        "acoSeconds": round(metrics.get("acoSeconds", 0), 2),
        "overheadSeconds": round(metrics.get("overheadSeconds", 0), 2),
        "savingPct": saving_pct,
    }


_PHASE0_WORKER_DB: Session | None = None


def _init_phase0_worker() -> None:
    """Sesión propia por proceso: el ``fork`` hereda el pool de conexiones del padre."""
    global _PHASE0_WORKER_DB
    from app.db.session import SessionLocal, engine

    engine.dispose(close=False)
    _PHASE0_WORKER_DB = SessionLocal()


def _phase0_scenario_task(task: tuple[str, int, int]) -> tuple[str, dict]:
    scenario_id, aco_ants, aco_iterations = task
    assert _PHASE0_WORKER_DB is not None
    # Calentamiento descartado + corrida medida, ambos en el mismo proceso.
    _run_scenario(_PHASE0_WORKER_DB, scenario_id, aco_ants=aco_ants, aco_iterations=aco_iterations)
    result = _run_scenario(
        _PHASE0_WORKER_DB, scenario_id, aco_ants=aco_ants, aco_iterations=aco_iterations
    )
    return scenario_id, _run_dict(scenario_id, result)


def run_phase0_baseline(
    *,
    aco_ants: int = DEFAULT_ANTS,
    aco_iterations: int = DEFAULT_ITERATIONS,
    workers: int = 1,
) -> dict:
    # Pre-calienta grafo y matrices en el padre (los hijos lo heredan por copy-on-write).
    warm_road_graph_cache()

    runs: list[dict] = []
    if workers and workers > 1 and len(PHASE0_SCENARIOS) > 1:
        from concurrent.futures import ProcessPoolExecutor

        tasks = [(scenario, aco_ants, aco_iterations) for scenario in PHASE0_SCENARIOS]
        by_scenario: dict[str, dict] = {}
        with ProcessPoolExecutor(
            max_workers=min(workers, len(tasks)), initializer=_init_phase0_worker
        ) as pool:
            for scenario_id, run in pool.map(_phase0_scenario_task, tasks):
                by_scenario[scenario_id] = run
        runs = [by_scenario[scenario] for scenario in PHASE0_SCENARIOS]
    else:
        with SessionLocal() as db:
            for scenario_id in PHASE0_SCENARIOS:
                _run_scenario(db, scenario_id, aco_ants=aco_ants, aco_iterations=aco_iterations)
                result = _run_scenario(
                    db, scenario_id, aco_ants=aco_ants, aco_iterations=aco_iterations
                )
                runs.append(_run_dict(scenario_id, result))

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "acoProfile": {"ants": aco_ants, "iterations": aco_iterations},
        "cacheState": "warm",
        "scenarioIds": list(PHASE0_SCENARIOS),
        "runs": runs,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="KPIs de referencia Fase 0 (5 escenarios, perfil ACO estándar).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers(),
        help=f"Procesos en paralelo (default: {default_workers()}); 1 = secuencial.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    payload = run_phase0_baseline(workers=max(1, args.workers))
    path = _output_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Fase 0 baseline: {len(payload['runs'])} escenarios en {path}")
    for run in payload["runs"]:
        dist = run["distanceKm"]
        print(
            f"   {run['scenarioId']:16}  "
            f"{dist['current']}→{dist['optimized']} km  "
            f"ahorro {run['savingPct']:+.1f}%  "
            f"no cubiertos {run['uncoveredPoints']}  "
            f"cómputo {run['computationSeconds']} s"
        )


if __name__ == "__main__":
    main()
