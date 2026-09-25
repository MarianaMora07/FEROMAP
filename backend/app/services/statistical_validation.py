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
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import numpy as np
from scipy.stats import rankdata
from scipy.stats import t as student_t
from scipy.stats import ttest_1samp, wilcoxon
from sqlalchemy.orm import Session

from app.db.models.statistical_validation import StatisticalValidation
from app.domain.scenarios import SCENARIO_ORDER
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
    effect_size_r: float | None
    effect_size_dz: float | None
    n_effective: int
    ci_lower: float | None
    ci_upper: float | None
    is_significant: bool
    runs: list[dict[str, Any]]


def _run_pair_once(
    db: Session,
    *,
    scenario_id: str,
    seed: int,
    aco_ants: int | None,
    aco_iterations: int | None,
) -> tuple[dict[str, Any], float | None, float | None]:
    """Una corrida pareada (línea base vs optimizada) → (detalle, km base, km optimizado).

    ``persist=False`` evita que el motor escriba la simulación (que el llamador descartaría
    con ``rollback``): la validación solo consume KPIs.
    """
    try:
        result = run_optimization_engine(
            db,
            scenario_id=scenario_id,
            aco_ants=aco_ants,
            aco_iterations=aco_iterations,
            auto_commit=False,
            auto_dispatch=False,
            persist=False,
            reporter=None,
            seed=seed,
        )
        db.rollback()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Corrida seed=%s falló: %s", seed, exc)
        db.rollback()
        return {"seed": seed, "error": str(exc)}, None, None

    kpis = result.get("kpis", {})
    cur_km = float(kpis.get("distanceKm", {}).get("current", 0))
    opt_km = float(kpis.get("distanceKm", {}).get("optimized", 0))
    detail = {
        "seed": seed,
        "distanceCurrentKm": round(cur_km, 2),
        "distanceOptimizedKm": round(opt_km, 2),
        "savingPct": round((1 - opt_km / cur_km) * 100, 1) if cur_km > 0 else 0,
    }
    return detail, cur_km, opt_km


def _finalize_validation(
    db: Session,
    scenario_id: str,
    runs_detail: list[dict[str, Any]],
    distances_current: list[float],
    distances_optimized: list[float],
) -> ValidationResult:
    """Calcula la prueba de Wilcoxon + tamaño del efecto y persiste la fila."""
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
    diff = arr_current - arr_optimized
    try:
        # Solo usar pares donde la diferencia no es cero
        non_zero = diff[diff != 0]
        if len(non_zero) >= 5:
            stat, p_value = wilcoxon(non_zero, alternative="greater")
            wilcoxon_stat = float(stat)
            wilcoxon_p = float(p_value)
            is_significant = wilcoxon_p < DEFAULT_ALPHA
    except Exception as exc:  # noqa: BLE001
        logger.warning("Wilcoxon falló: %s", exc)

    # Tamaño del efecto del contraste pareado (reproducible, no a mano).
    effect_size_r = rank_biserial(diff)
    effect_size_dz = cohen_dz(diff)
    n_effective = int(np.count_nonzero(diff))

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
    except Exception as exc:  # noqa: BLE001
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
        effect_size_r=effect_size_r,
        effect_size_dz=effect_size_dz,
        n_effective=n_effective,
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
        effect_size_r=Decimal(str(effect_size_r)) if effect_size_r is not None else None,
        effect_size_dz=Decimal(str(effect_size_dz)) if effect_size_dz is not None else None,
        n_effective=n_effective,
        confidence_interval_lower=Decimal(str(ci_lower)) if ci_lower is not None else None,
        confidence_interval_upper=Decimal(str(ci_upper)) if ci_upper is not None else None,
        is_significant=is_significant,
        runs_json=json.dumps(runs_detail, ensure_ascii=False),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return validation


def run_statistical_validation(
    db: Session,
    *,
    scenario_id: str = "normal",
    n_runs: int = DEFAULT_N_RUNS,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
) -> ValidationResult:
    """Ejecuta N corridas independientes y aplica prueba de Wilcoxon (secuencial)."""
    distances_current: list[float] = []
    distances_optimized: list[float] = []
    runs_detail: list[dict[str, Any]] = []

    for i in range(n_runs):
        seed = i + 1
        logger.info("Validación %s: corrida %d/%d (seed=%d)", scenario_id, i + 1, n_runs, seed)
        detail, cur_km, opt_km = _run_pair_once(
            db,
            scenario_id=scenario_id,
            seed=seed,
            aco_ants=aco_ants,
            aco_iterations=aco_iterations,
        )
        runs_detail.append({"run": i + 1, **detail})
        if cur_km is not None and opt_km is not None:
            distances_current.append(cur_km)
            distances_optimized.append(opt_km)

    return _finalize_validation(
        db, scenario_id, runs_detail, distances_current, distances_optimized
    )


_WORKER_DB: Session | None = None


def _init_worker() -> None:
    """Sesión propia por proceso: el ``fork`` hereda el pool de conexiones del padre."""
    global _WORKER_DB
    from app.db.session import SessionLocal, engine

    engine.dispose(close=False)
    _WORKER_DB = SessionLocal()


def _worker_task(
    task: tuple[str, int, int | None, int | None],
) -> tuple[str, dict[str, Any], float | None, float | None]:
    scenario_id, seed, aco_ants, aco_iterations = task
    assert _WORKER_DB is not None
    detail, cur_km, opt_km = _run_pair_once(
        _WORKER_DB,
        scenario_id=scenario_id,
        seed=seed,
        aco_ants=aco_ants,
        aco_iterations=aco_iterations,
    )
    return scenario_id, detail, cur_km, opt_km


def _run_parallel(
    db: Session,
    targets: list[str],
    n_runs: int,
    workers: int,
) -> list[ValidationResult]:
    """Corre todas las (escenario, semilla) en un pool de procesos y agrupa por escenario."""
    from concurrent.futures import ProcessPoolExecutor

    # Pre-calienta el grafo en el padre para que los hijos lo hereden por copy-on-write.
    try:
        from app.services.graph_service import warm_road_graph_cache

        warm_road_graph_cache()
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudo precalentar el grafo: %s", exc)

    tasks = [
        (scenario, seed, None, None)
        for scenario in targets
        for seed in range(1, n_runs + 1)
    ]
    grouped: dict[str, list[tuple[int, dict[str, Any], float | None, float | None]]] = {
        scenario: [] for scenario in targets
    }
    with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker) as pool:
        for scenario_id, detail, cur_km, opt_km in pool.map(_worker_task, tasks):
            grouped[scenario_id].append((detail["seed"], detail, cur_km, opt_km))

    validations: list[ValidationResult] = []
    for scenario in targets:
        ordered = sorted(grouped[scenario], key=lambda item: item[0])
        runs_detail: list[dict[str, Any]] = []
        distances_current: list[float] = []
        distances_optimized: list[float] = []
        for index, (_seed, detail, cur_km, opt_km) in enumerate(ordered, start=1):
            runs_detail.append({"run": index, **detail})
            if cur_km is not None and opt_km is not None:
                distances_current.append(cur_km)
                distances_optimized.append(opt_km)
        validations.append(
            _finalize_validation(db, scenario, runs_detail, distances_current, distances_optimized)
        )
    return validations


def run_statistical_validations(
    db: Session,
    *,
    scenario_ids: Sequence[str] = SCENARIO_ORDER,
    n_runs: int = DEFAULT_N_RUNS,
    workers: int = 1,
    on_step: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Valida la línea base vs la optimización en varios escenarios (familia + Holm).

    Cada escenario persiste su propia fila en ``statistical_validations``. El ajuste de
    Holm–Bonferroni se aplica sobre los p-valores de los contrastes efectivamente
    realizados: los escenarios sin muestra suficiente quedan en ``None`` y no entran en la
    familia. Con ``workers > 1`` las corridas (escenario × semilla) se reparten en un pool de
    procesos; el resultado es idéntico porque cada semilla es determinista.

    ``on_step(index, total, label)`` avisa **antes** de cada escenario en la ruta secuencial
    (permite progreso en el job de la vista de calibración).

    Dentro del API (uvicorn con hilos) conviene dejar ``workers=1`` por el ``fork``; para
    lotes usa el CLI ``just wilcoxon --workers N``.
    """
    targets = list(scenario_ids)
    task_count = len(targets) * n_runs
    effective_workers = max(1, min(workers, task_count)) if workers else 1
    if effective_workers > 1 and task_count > 1:
        validations = _run_parallel(db, targets, n_runs, effective_workers)
        if on_step is not None:
            on_step(len(targets), len(targets), "familia completa")
    else:
        validations = []
        for index, scenario in enumerate(targets, start=1):
            if on_step is not None:
                on_step(index, len(targets), f"Validando {scenario}")
            validations.append(
                run_statistical_validation(db, scenario_id=scenario, n_runs=n_runs)
            )
    adjusted = holm_adjust([result.wilcoxon_p_value for result in validations])

    rows: list[dict[str, Any]] = []
    for result, p_value_holm in zip(validations, adjusted):
        rows.append(
            {
                "scenarioId": result.scenario_id,
                "nRuns": result.n_runs,
                "nEffective": result.n_effective,
                "meanDistanceCurrent": result.mean_current,
                "meanDistanceOptimized": result.mean_optimized,
                "savingPct": result.saving_pct,
                "stdDistanceOptimized": result.std_optimized,
                "wilcoxon": {
                    "statistic": result.wilcoxon_statistic,
                    "pValue": result.wilcoxon_p_value,
                },
                "pValueHolm": p_value_holm,
                "effectSize": {
                    "rankBiserial": result.effect_size_r,
                    "cohenDz": result.effect_size_dz,
                },
                "confidenceInterval": {
                    "lower": result.ci_lower,
                    "upper": result.ci_upper,
                },
                "isSignificant": result.is_significant,
                "isSignificantHolm": (
                    p_value_holm is not None and p_value_holm < DEFAULT_ALPHA
                ),
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "nRuns": n_runs,
        "family": targets,
        "validations": rows,
    }


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
        "effectSize": {
            "rankBiserial": float(r.effect_size_r) if r.effect_size_r is not None else None,
            "cohenDz": float(r.effect_size_dz) if r.effect_size_dz is not None else None,
            "nEffective": r.n_effective,
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


def rank_biserial(differences: Sequence[float]) -> float | None:
    """Correlación rangos-biserial del contraste de rangos con signo.

    ``(Σ rangos de las diferencias positivas − Σ rangos de las negativas) / Σ rangos`` sobre
    las diferencias no nulas. Vale ``1.0`` cuando todas las diferencias tienen el mismo signo
    y ``None`` si no hay diferencias utilizables.
    """
    clean = np.asarray([float(value) for value in differences], dtype=float)
    nonzero = clean[clean != 0]
    if nonzero.size == 0:
        return None
    ranks = rankdata(np.abs(nonzero))
    positive = float(ranks[nonzero > 0].sum())
    negative = float(ranks[nonzero < 0].sum())
    total = positive + negative
    if total == 0:
        return None
    return (positive - negative) / total


def cohen_dz(differences: Sequence[float]) -> float | None:
    """d de Cohen pareada: media de las diferencias entre su desviación estándar muestral."""
    sample = np.asarray([float(value) for value in differences], dtype=float)
    if sample.size < 2:
        return None
    std = float(np.std(sample, ddof=1))
    if std <= 0:
        return None
    return float(np.mean(sample)) / std


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
