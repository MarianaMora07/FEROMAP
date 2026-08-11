"""Benchmark ACO: escenarios × perfiles para observabilidad (Fase D)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.services.optimization_service import run_optimization_engine

logger = logging.getLogger(__name__)

BENCHMARK_SCENARIOS: list[dict[str, str]] = [
    {"id": "normal", "label": "Tráfico normal"},
    {"id": "peak_traffic", "label": "Tráfico pico"},
    {"id": "rain", "label": "Lluvia intensa"},
    {"id": "saturated", "label": "Contenedores saturados"},
    {"id": "broken_vehicle", "label": "Vehículo averiado"},
]

ACO_BENCHMARK_PROFILES: list[dict[str, Any]] = [
    {"id": "fast", "label": "Rápido", "acoAnts": 6, "acoIterations": 10},
    {"id": "standard", "label": "Estándar", "acoAnts": 12, "acoIterations": 20},
    {"id": "precise", "label": "Preciso", "acoAnts": 20, "acoIterations": 40},
]


def _benchmark_dir() -> Path:
    path = Path(settings.data_dir) / "cache" / "benchmarks"
    path.mkdir(parents=True, exist_ok=True)
    return path


def benchmark_cache_path() -> Path:
    return _benchmark_dir() / "aco_latest.json"


def load_aco_benchmark() -> dict[str, Any] | None:
    path = benchmark_cache_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Benchmark corrupto (%s): %s", path, exc)
        return None


def save_aco_benchmark(payload: dict[str, Any]) -> Path:
    path = benchmark_cache_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def run_aco_benchmark(db: Session) -> dict[str, Any]:
    """Ejecuta 5 escenarios × 3 perfiles ACO sin persistir simulaciones."""
    runs: list[dict[str, Any]] = []
    started = datetime.now(timezone.utc)

    for scenario in BENCHMARK_SCENARIOS:
        for profile in ACO_BENCHMARK_PROFILES:
            scenario_id = scenario["id"]
            logger.info("Benchmark %s / %s", scenario_id, profile["id"])
            try:
                result = run_optimization_engine(
                    db,
                    scenario_id,
                    aco_ants=profile["acoAnts"],
                    aco_iterations=profile["acoIterations"],
                    auto_commit=False,
                    auto_dispatch=False,
                    reporter=None,
                )
                db.rollback()
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                runs.append(
                    {
                        "scenarioId": scenario_id,
                        "scenarioLabel": scenario["label"],
                        "profileId": profile["id"],
                        "profileLabel": profile["label"],
                        "acoAnts": profile["acoAnts"],
                        "acoIterations": profile["acoIterations"],
                        "error": str(exc),
                    }
                )
                continue

            kpis = result["kpis"]
            metrics = kpis.get("engineMetrics") or {}
            current_km = kpis["distanceKm"]["current"]
            optimized_km = kpis["distanceKm"]["optimized"]
            saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0

            runs.append(
                {
                    "scenarioId": scenario_id,
                    "scenarioLabel": scenario["label"],
                    "profileId": profile["id"],
                    "profileLabel": profile["label"],
                    "acoAnts": profile["acoAnts"],
                    "acoIterations": profile["acoIterations"],
                    "computationSeconds": metrics.get("computationSeconds", 0),
                    "graphLoadSeconds": metrics.get("graphLoadSeconds", 0),
                    "acoSeconds": metrics.get("acoSeconds", 0),
                    "overheadSeconds": metrics.get("overheadSeconds", 0),
                    "savingPct": saving_pct,
                    "distanceKmOptimized": optimized_km,
                    "acoIterationsRun": metrics.get("acoIterationsRun", profile["acoIterations"]),
                    "acoStoppedEarly": metrics.get("acoStoppedEarly", False),
                    "matrixCacheHit": metrics.get("matrixCacheHit", False),
                    "matrixCacheIncremental": metrics.get("matrixCacheIncremental", False),
                }
            )

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioCount": len(BENCHMARK_SCENARIOS),
        "profileCount": len(ACO_BENCHMARK_PROFILES),
        "runs": runs,
    }
    save_aco_benchmark(payload)
    return payload
