"""Estudio de sensibilidad ACO — Fase 3 (rigor algorítmico)."""

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

DEFAULT_SCENARIO_ID = "normal"

# Variación de hormigas (iteraciones fijas en 20)
ANT_SENSITIVITY_SERIES: list[dict[str, Any]] = [
    {"label": "8 hormigas", "acoAnts": 8, "acoIterations": 20, "axis": "ants"},
    {"label": "12 hormigas (estándar)", "acoAnts": 12, "acoIterations": 20, "axis": "ants"},
    {"label": "20 hormigas", "acoAnts": 20, "acoIterations": 20, "axis": "ants"},
]

# Variación de iteraciones (hormigas fijas en 12)
ITERATION_SENSITIVITY_SERIES: list[dict[str, Any]] = [
    {"label": "10 iteraciones", "acoAnts": 12, "acoIterations": 10, "axis": "iterations"},
    {"label": "20 iteraciones (estándar)", "acoAnts": 12, "acoIterations": 20, "axis": "iterations"},
    {"label": "40 iteraciones", "acoAnts": 12, "acoIterations": 40, "axis": "iterations"},
]


def _sensitivity_dir(*, ensure: bool = False) -> Path:
    path = Path(settings.data_dir) / "cache" / "phase3"
    if ensure:
        path.mkdir(parents=True, exist_ok=True)
    return path


def sensitivity_cache_path() -> Path:
    return _sensitivity_dir() / "aco_sensitivity.json"


def load_aco_sensitivity() -> dict[str, Any] | None:
    path = sensitivity_cache_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Sensibilidad ACO corrupta (%s): %s", path, exc)
        return None


def save_aco_sensitivity(payload: dict[str, Any]) -> Path:
    path = sensitivity_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _run_sensitivity_case(
    db: Session,
    *,
    scenario_id: str,
    label: str,
    aco_ants: int,
    aco_iterations: int,
    axis: str,
) -> dict[str, Any]:
    try:
        result = run_optimization_engine(
            db,
            scenario_id,
            aco_ants=aco_ants,
            aco_iterations=aco_iterations,
            auto_commit=False,
            auto_dispatch=False,
            reporter=None,
        )
        db.rollback()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return {
            "label": label,
            "scenarioId": scenario_id,
            "acoAnts": aco_ants,
            "acoIterations": aco_iterations,
            "axis": axis,
            "error": str(exc),
        }

    kpis = result["kpis"]
    metrics = kpis.get("engineMetrics") or {}
    current_km = kpis["distanceKm"]["current"]
    optimized_km = kpis["distanceKm"]["optimized"]
    saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0

    return {
        "label": label,
        "scenarioId": scenario_id,
        "acoAnts": aco_ants,
        "acoIterations": aco_iterations,
        "axis": axis,
        "computationSeconds": round(float(metrics.get("computationSeconds", 0)), 2),
        "acoSeconds": round(float(metrics.get("acoSeconds", 0)), 2),
        "distanceKmOptimized": round(float(optimized_km), 2),
        "distanceKmBaseline": round(float(current_km), 2),
        "savingPct": saving_pct,
        "acoIterationsRun": metrics.get("acoIterationsRun", aco_iterations),
        "acoStoppedEarly": bool(metrics.get("acoStoppedEarly", False)),
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
    }


def run_aco_sensitivity(db: Session, *, scenario_id: str = DEFAULT_SCENARIO_ID) -> dict[str, Any]:
    """6 corridas: 3 perfiles de hormigas + 3 perfiles de iteraciones (escenario normal)."""
    started = datetime.now(timezone.utc)
    runs: list[dict[str, Any]] = []

    for case in [*ANT_SENSITIVITY_SERIES, *ITERATION_SENSITIVITY_SERIES]:
        logger.info("Sensibilidad ACO %s (%s×%s)", case["label"], case["acoAnts"], case["acoIterations"])
        runs.append(
            _run_sensitivity_case(
                db,
                scenario_id=scenario_id,
                label=case["label"],
                aco_ants=case["acoAnts"],
                aco_iterations=case["acoIterations"],
                axis=case["axis"],
            )
        )

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioId": scenario_id,
        "standardProfile": {"acoAnts": 12, "acoIterations": 20},
        "runs": runs,
    }
    save_aco_sensitivity(payload)
    return payload
