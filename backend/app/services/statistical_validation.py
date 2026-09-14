"""Validación estadística: Prueba de Wilcoxon con N corridas independientes."""

from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import numpy as np
from scipy.stats import wilcoxon
from sqlalchemy.orm import Session

from app.db.models.statistical_validation import StatisticalValidation
from app.services.optimization_service import run_optimization_engine

logger = logging.getLogger(__name__)

DEFAULT_N_RUNS = 30
DEFAULT_ALPHA = 0.05
BOOTSTRAP_SAMPLES = 10000


@dataclass(frozen=True)
class ValidationResult:
    scenario_id: str
    n_runs: int
    distances_current: list[float]
    distances_optimized: list[float]
    mean_current: float
    mean_optimized: float
    std_optimized: float
    saving_pct: float
    wilcoxon_statistic: float | None
    wilcoxon_p_value: float | None
    ci_lower: float | None
    ci_upper: float | None
    is_significant: bool
    runs: list[dict[str, Any]]


def run_statistical_validation(
    db: Session,
    *,
    scenario_id: str = "normal",
    n_runs: int = DEFAULT_N_RUNS,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
) -> ValidationResult:
    """Ejecuta N corridas independientes y aplica prueba de Wilcoxon."""
    distances_current: list[float] = []
    distances_optimized: list[float] = []
    runs_detail: list[dict[str, Any]] = []

    for i in range(n_runs):
        seed = i + 1
        logger.info("Validación %s: corrida %d/%d (seed=%d)", scenario_id, i + 1, n_runs, seed)
        try:
            result = run_optimization_engine(
                db,
                scenario_id=scenario_id,
                aco_ants=aco_ants,
                aco_iterations=aco_iterations,
                auto_commit=False,
                auto_dispatch=False,
                reporter=None,
                seed=seed,
            )
            db.rollback()

            kpis = result.get("kpis", {})
            cur_km = float(kpis.get("distanceKm", {}).get("current", 0))
            opt_km = float(kpis.get("distanceKm", {}).get("optimized", 0))

            distances_current.append(cur_km)
            distances_optimized.append(opt_km)
            runs_detail.append({
                "run": i + 1,
                "seed": seed,
                "distanceCurrentKm": round(cur_km, 2),
                "distanceOptimizedKm": round(opt_km, 2),
                "savingPct": round((1 - opt_km / cur_km) * 100, 1) if cur_km > 0 else 0,
            })
        except Exception as exc:
            logger.warning("Corrida %d falló: %s", i + 1, exc)
            db.rollback()
            runs_detail.append({
                "run": i + 1,
                "seed": seed,
                "error": str(exc),
            })

    if len(distances_current) < 2:
        raise RuntimeError("Se necesitan al menos 2 corridas exitosas para la prueba estadística")

    arr_current = np.array(distances_current)
    arr_optimized = np.array(distances_optimized)

    mean_current = float(np.mean(arr_current))
    mean_optimized = float(np.mean(arr_optimized))
    std_optimized = float(np.std(arr_optimized, ddof=1))
    saving_pct = round((1 - mean_optimized / mean_current) * 100, 1) if mean_current > 0 else 0.0

    # Prueba de Wilcoxon (rango con signo, una cola: optimización < tradicional)
    wilcoxon_stat = None
    wilcoxon_p = None
    is_significant = False
    try:
        diff = arr_current - arr_optimized
        # Solo usar pares donde la diferencia no es cero
        non_zero = diff[diff != 0]
        if len(non_zero) >= 5:
            stat, p_value = wilcoxon(non_zero, alternative="greater")
            wilcoxon_stat = float(stat)
            wilcoxon_p = float(p_value)
            is_significant = wilcoxon_p < DEFAULT_ALPHA
    except Exception as exc:
        logger.warning("Wilcoxon falló: %s", exc)

    # Intervalo de confianza bootstrap (95%) sobre la diferencia de medias
    ci_lower = None
    ci_upper = None
    try:
        diff_samples = arr_current - arr_optimized
        rng = random.Random(42)
        boot_means = []
        for _ in range(BOOTSTRAP_SAMPLES):
            sample = rng.choices(list(diff_samples), k=len(diff_samples))
            boot_means.append(float(np.mean(sample)))
        boot_means.sort()
        ci_lower = round(boot_means[int(0.025 * len(boot_means))], 2)
        ci_upper = round(boot_means[int(0.975 * len(boot_means))], 2)
    except Exception as exc:
        logger.warning("Bootstrap IC falló: %s", exc)

    validation = ValidationResult(
        scenario_id=scenario_id,
        n_runs=len(distances_current),
        distances_current=distances_current,
        distances_optimized=distances_optimized,
        mean_current=round(mean_current, 2),
        mean_optimized=round(mean_optimized, 2),
        std_optimized=round(std_optimized, 2),
        saving_pct=saving_pct,
        wilcoxon_statistic=wilcoxon_stat,
        wilcoxon_p_value=wilcoxon_p,
        ci_lower=ci_lower,
        ci_upper=ci_upper,
        is_significant=is_significant,
        runs=runs_detail,
    )

    # Persistir
    record = StatisticalValidation(
        scenario_id=scenario_id,
        n_runs=len(distances_current),
        mean_distance_current=Decimal(str(mean_current)),
        mean_distance_optimized=Decimal(str(mean_optimized)),
        saving_pct=Decimal(str(saving_pct)),
        std_distance_optimized=Decimal(str(std_optimized)),
        wilcoxon_statistic=Decimal(str(wilcoxon_stat)) if wilcoxon_stat is not None else None,
        wilcoxon_p_value=Decimal(str(wilcoxon_p)) if wilcoxon_p is not None else None,
        confidence_interval_lower=Decimal(str(ci_lower)) if ci_lower is not None else None,
        confidence_interval_upper=Decimal(str(ci_upper)) if ci_upper is not None else None,
        is_significant=is_significant,
        runs_json=json.dumps(runs_detail, ensure_ascii=False),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return validation


def list_validations(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = (
        db.query(StatisticalValidation)
        .order_by(StatisticalValidation.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_row_to_dict(r) for r in rows]


def get_validation(db: Session, validation_id: int) -> dict[str, Any] | None:
    row = db.get(StatisticalValidation, validation_id)
    if row is None:
        return None
    return _row_to_dict(row)


def _row_to_dict(r: StatisticalValidation) -> dict[str, Any]:
    return {
        "id": r.id,
        "scenarioId": r.scenario_id,
        "nRuns": r.n_runs,
        "meanDistanceCurrent": float(r.mean_distance_current),
        "meanDistanceOptimized": float(r.mean_distance_optimized),
        "savingPct": float(r.saving_pct),
        "stdDistanceOptimized": float(r.std_distance_optimized),
        "wilcoxon": {
            "statistic": float(r.wilcoxon_statistic) if r.wilcoxon_statistic is not None else None,
            "pValue": float(r.wilcoxon_p_value) if r.wilcoxon_p_value is not None else None,
        },
        "confidenceInterval": {
            "lower": float(r.confidence_interval_lower) if r.confidence_interval_lower is not None else None,
            "upper": float(r.confidence_interval_upper) if r.confidence_interval_upper is not None else None,
        },
        "isSignificant": r.is_significant,
        "runs": json.loads(r.runs_json) if r.runs_json else [],
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }
