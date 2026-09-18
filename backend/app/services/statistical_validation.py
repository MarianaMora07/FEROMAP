"""Validación estadística: Prueba de Wilcoxon con N corridas independientes.

Además del estudio voraz vs optimizado, este módulo expone los **contrastes reutilizables**
que necesita el protocolo de calibración (plan de calibración metodológica, Anexo B): rango
con signo pareado bilateral, Holm sobre una familia pre-declarada, IC bootstrap de la mediana,
IC de la media con t de Student, tamaño de muestra requerido y delta de Cliff. Son funciones
puras: no tocan la BD ni dependen del motor.
"""

from __future__ import annotations

import json
import logging
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import numpy as np
from scipy.stats import t as student_t
from scipy.stats import ttest_1samp, wilcoxon
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


# --------------------------------------------------------------------------- #
# Contrastes reutilizables por la calibración (funciones puras)
# --------------------------------------------------------------------------- #


def paired_wilcoxon(
    differences: Sequence[float],
    *,
    alternative: str = "two-sided",
    zero_method: str = "wilcox",
    alpha: float = DEFAULT_ALPHA,
) -> dict[str, Any]:
    """Rango con signo de Wilcoxon sobre un vector de diferencias pareadas.

    A diferencia del contraste interno de :func:`run_statistical_validation`, es **bilateral**
    por defecto, declara ``zero_method`` y devuelve el tamaño efectivo de la muestra. Con
    diferencias idénticas (empates exactos) devuelve ``pValue = None``: la ausencia de evidencia
    **no** es evidencia de equivalencia; para eso está el IC contra ``δ``.
    """
    clean = [float(value) for value in differences]
    nonzero = [value for value in clean if value != 0]
    result: dict[str, Any] = {
        "n": len(clean),
        "nEffective": len(nonzero),
        "alternative": alternative,
        "zeroMethod": zero_method,
        "statistic": None,
        "pValue": None,
        "significant": False,
    }
    if len(nonzero) < 5:
        return result
    try:
        statistic, p_value = wilcoxon(clean, alternative=alternative, zero_method=zero_method)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Wilcoxon pareado falló: %s", exc)
        return result
    result["statistic"] = float(statistic)
    result["pValue"] = float(p_value)
    result["significant"] = bool(p_value < alpha)
    return result


def holm_adjust(p_values: Sequence[float | None]) -> list[float | None]:
    """Holm–Bonferroni: uniformemente más potente que Bonferroni y sin supuestos.

    La familia la declara quien llama —contrastes pre-declarados—; esta función no decide qué
    se compara, solo ajusta. Los ``None`` (contraste no realizable) se conservan como ``None``.
    """
    indexed = [(index, float(p)) for index, p in enumerate(p_values) if p is not None]
    adjusted: list[float | None] = [None] * len(p_values)
    if not indexed:
        return adjusted
    total = len(indexed)
    running = 0.0
    for rank, (index, p_value) in enumerate(sorted(indexed, key=lambda item: item[1])):
        running = max(running, min(1.0, (total - rank) * p_value))
        adjusted[index] = running
    return adjusted


def bootstrap_ci(
    values: Sequence[float],
    *,
    level: float = 0.95,
    resamples: int = BOOTSTRAP_SAMPLES,
    seed: int = 42,
    statistic: Callable[[np.ndarray], float] | None = None,
) -> tuple[float, float] | None:
    """IC percentil bootstrap de la **mediana** (robusta a colas) salvo otro estadístico."""
    sample = np.asarray([float(value) for value in values], dtype=float)
    if sample.size < 2:
        return None
    estimator = statistic or (lambda array: float(np.median(array)))
    generator = np.random.default_rng(seed)
    draws = generator.integers(0, sample.size, size=(resamples, sample.size))
    estimates = np.sort(np.apply_along_axis(estimator, 1, sample[draws]))
    return (
        float(np.quantile(estimates, (1 - level) / 2)),
        float(np.quantile(estimates, 1 - (1 - level) / 2)),
    )


def mean_ci(values: Sequence[float], *, level: float = 0.95) -> tuple[float, float] | None:
    """IC de la media con t de Student (correcto con n pequeño)."""
    sample = np.asarray([float(value) for value in values], dtype=float)
    if sample.size < 2:
        return None
    mean = float(np.mean(sample))
    half = (
        float(student_t.ppf(1 - (1 - level) / 2, sample.size - 1))
        * float(np.std(sample, ddof=1))
        / float(np.sqrt(sample.size))
    )
    return (mean - half, mean + half)


def required_n(sd: float, delta: float, *, paired: bool = True, level: float = 0.95) -> int:
    """Semillas necesarias para que el IC de una diferencia quede dentro de ±``delta``.

    Con ``paired`` se asume el **peor caso** ``s_diff = √2 · sd`` (dos configuraciones
    independientes). El ruido pareado real solo se mide con dos configuraciones sobre las
    mismas semillas, así que una sola configuración replicada da la cota pesimista.
    """
    if sd <= 0 or delta <= 0:
        return 0
    factor = float(np.sqrt(2.0)) if paired else 1.0
    for n in range(2, 2001):
        critical = float(student_t.ppf(1 - (1 - level) / 2, n - 1))
        if critical * factor * sd / float(np.sqrt(n)) <= delta:
            return n
    return 2000


def cliffs_delta(sample_a: Sequence[float], sample_b: Sequence[float]) -> float | None:
    """Tamaño de efecto no paramétrico en [-1, 1]: P(a > b) − P(a < b)."""
    a = np.asarray([float(value) for value in sample_a], dtype=float)
    b = np.asarray([float(value) for value in sample_b], dtype=float)
    if a.size == 0 or b.size == 0:
        return None
    differences = a[:, None] - b[None, :]
    return float((np.sum(differences > 0) - np.sum(differences < 0)) / differences.size)


def tost_paired(
    differences: Sequence[float],
    delta: float,
    *,
    alpha: float = DEFAULT_ALPHA,
) -> dict[str, Any]:
    """TOST de equivalencia sobre diferencias pareadas contra el margen ±``delta``.

    Dos pruebas t de una cola: la diferencia media es mayor que −δ y menor que +δ. Se declara
    equivalencia cuando **ambas** rechazan con ``alpha`` (``pValue < alpha``). Un test no
    significativo no sirve: la ausencia de evidencia no es evidencia de ausencia, y para eso
    está el IC contra δ.

    La t de Student asume normalidad de las diferencias; con ``n`` pequeño se reporta junto al
    IC bootstrap, que es el criterio principal del plan (§3).
    """
    clean = np.asarray([float(value) for value in differences], dtype=float)
    result: dict[str, Any] = {
        "n": int(clean.size),
        "delta": float(delta),
        "lowerPValue": None,
        "upperPValue": None,
        "pValue": None,
        "equivalent": False,
    }
    if clean.size < 2 or delta <= 0:
        return result
    try:
        lower = float(ttest_1samp(clean, popmean=-delta, alternative="greater").pvalue)
        upper = float(ttest_1samp(clean, popmean=delta, alternative="less").pvalue)
    except Exception as exc:  # noqa: BLE001
        logger.warning("TOST pareado falló: %s", exc)
        return result
    result["lowerPValue"] = lower
    result["upperPValue"] = upper
    result["pValue"] = max(lower, upper)
    result["equivalent"] = bool(result["pValue"] < alpha)
    return result
