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
from app.services.sweep_progress import CancelCheck, OnRun, SweepCancelled

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO_ID = "normal"
DEFAULT_SEED = 42

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

# Fase 13 — sensibilidad de los hiperparámetros clásicos del ACO (α/β/ρ/Q). Cada serie
# varía un parámetro, mantiene el perfil estándar (12×20) y deja el resto en su valor por
# defecto (α=1, β=3, ρ=0.12, Q=1). El valor viaja **por corrida** (no se toca la
# configuración global de Administración), que es lo que hace reproducible la evidencia.
STANDARD_HYPERPARAMETERS: dict[str, float] = {
    "acoAlpha": 1.0,
    "acoBeta": 3.0,
    "acoRho": 0.12,
    "pheromoneQ": 1.0,
}

# Perfil fijo (hormigas × iteraciones) de las series de hiperparámetros.
_STANDARD_PROFILE: dict[str, Any] = {"acoAnts": 12, "acoIterations": 20}

HYPERPARAMETER_SENSITIVITY_SERIES: list[dict[str, Any]] = [
    {**_STANDARD_PROFILE, "label": "α 0.5", "axis": "alpha", "acoAlpha": 0.5},
    {**_STANDARD_PROFILE, "label": "α 1 (estándar)", "axis": "alpha", "acoAlpha": 1.0},
    {**_STANDARD_PROFILE, "label": "α 2", "axis": "alpha", "acoAlpha": 2.0},
    {**_STANDARD_PROFILE, "label": "β 1", "axis": "beta", "acoBeta": 1.0},
    {**_STANDARD_PROFILE, "label": "β 3 (estándar)", "axis": "beta", "acoBeta": 3.0},
    {**_STANDARD_PROFILE, "label": "β 5", "axis": "beta", "acoBeta": 5.0},
    {**_STANDARD_PROFILE, "label": "ρ 0.05", "axis": "rho", "acoRho": 0.05},
    {**_STANDARD_PROFILE, "label": "ρ 0.12 (estándar)", "axis": "rho", "acoRho": 0.12},
    {**_STANDARD_PROFILE, "label": "ρ 0.30", "axis": "rho", "acoRho": 0.30},
    {**_STANDARD_PROFILE, "label": "Q 0.5", "axis": "q", "pheromoneQ": 0.5},
    {**_STANDARD_PROFILE, "label": "Q 1 (estándar)", "axis": "q", "pheromoneQ": 1.0},
    {**_STANDARD_PROFILE, "label": "Q 2", "axis": "q", "pheromoneQ": 2.0},
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
    seed: int,
    aco_alpha: float | None = None,
    aco_beta: float | None = None,
    aco_rho: float | None = None,
    pheromone_q: float | None = None,
) -> dict[str, Any]:
    hyperparameters = {
        "acoAlpha": aco_alpha,
        "acoBeta": aco_beta,
        "acoRho": aco_rho,
        "pheromoneQ": pheromone_q,
    }
    try:
        result = run_optimization_engine(
            db,
            scenario_id,
            aco_ants=aco_ants,
            aco_iterations=aco_iterations,
            aco_alpha=aco_alpha,
            aco_beta=aco_beta,
            aco_rho=aco_rho,
            pheromone_q=pheromone_q,
            seed=seed,
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
            **hyperparameters,
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
        **hyperparameters,
        "computationSeconds": round(float(metrics.get("computationSeconds", 0)), 2),
        "acoSeconds": round(float(metrics.get("acoSeconds", 0)), 2),
        "distanceKmOptimized": round(float(optimized_km), 2),
        "distanceKmBaseline": round(float(current_km), 2),
        "savingPct": saving_pct,
        "acoIterationsRun": metrics.get("acoIterationsRun", aco_iterations),
        "acoStoppedEarly": bool(metrics.get("acoStoppedEarly", False)),
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
    }


def run_aco_sensitivity(
    db: Session,
    *,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    on_run: OnRun | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
) -> dict[str, Any]:
    """18 corridas (escenario normal, semilla fija):

    - hormigas 8/12/20 (iteraciones en 20),
    - iteraciones 10/20/40 (hormigas en 12),
    - hiperparámetros α/β/ρ/Q en 3 niveles cada uno.

    El KPI de referencia es la **distancia optimizada** (decisión D2); el resto de
    columnas son guardarraíles.

    ``on_run``/``cancel_check`` conectan el barrido con el job asíncrono: ``on_run``
    reporta el progreso antes de cada corrida y ``cancel_check`` corta entre corridas.
    Si se cancela, lanza :class:`SweepCancelled` y **no** escribe la caché.
    """
    started = datetime.now(timezone.utc)
    runs: list[dict[str, Any]] = []

    series = [
        *ANT_SENSITIVITY_SERIES,
        *ITERATION_SENSITIVITY_SERIES,
        *HYPERPARAMETER_SENSITIVITY_SERIES,
    ]
    total = len(series)
    for index, case in enumerate(series):
        if cancel_check is not None and cancel_check():
            raise SweepCancelled(f"Sensibilidad ACO cancelada tras {len(runs)}/{total} corridas")
        if on_run is not None:
            on_run(index, total, case["label"])
        logger.info(
            "Sensibilidad ACO %s (%s×%s)", case["label"], case["acoAnts"], case["acoIterations"]
        )
        runs.append(
            _run_sensitivity_case(
                db,
                scenario_id=scenario_id,
                label=case["label"],
                aco_ants=case["acoAnts"],
                aco_iterations=case["acoIterations"],
                axis=case["axis"],
                seed=seed,
                aco_alpha=case.get("acoAlpha"),
                aco_beta=case.get("acoBeta"),
                aco_rho=case.get("acoRho"),
                pheromone_q=case.get("pheromoneQ"),
            )
        )

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioId": scenario_id,
        "seed": seed,
        "standardProfile": {"acoAnts": 12, "acoIterations": 20},
        "standardHyperparameters": STANDARD_HYPERPARAMETERS,
        "instanceFingerprint": instance_fingerprint,
        "runs": runs,
    }
    save_aco_sensitivity(payload)
    return payload
