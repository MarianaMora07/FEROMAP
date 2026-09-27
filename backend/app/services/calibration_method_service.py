"""Protocolo de calibración metodológica: diseño de casos y análisis (C1–C8).

Plan: ``docs/fase-13/plan-calibracion-metodologica.md``.

Cada fase tiene dos mitades:

- **diseño de casos** (qué se corre), y
- **análisis** (qué se concluye), como funciones **puras** sobre el payload ya guardado.

Aquí no se ejecuta ninguna corrida ni se escribe en la BD: el runner es
:func:`app.services.aco_sensitivity_service.run_aco_sensitivity` y la evidencia vive en
``calibration_sweeps`` (ADR-011). Por eso el análisis es regenerable desde la evidencia sin
volver a gastar CPU, y por eso se puede revisar la conclusión de una fase meses después.

Convenciones de medición (C0 del plan), que estas funciones **asumen** del payload:

- todas las configuraciones comparten el mismo conjunto de semillas (números aleatorios
  comunes), lo que hace que las comparaciones sean pareadas;
- cada corrida declara su presupuesto (``workUnits``) y sus iteraciones efectivas;
- las corridas con ``error`` o con ``uncoveredPoints > 0`` quedan fuera del ranking.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Callable, Sequence
from typing import Any

import numpy as np
from scipy.stats import friedmanchisquare

from app.services.aco_sensitivity_service import STANDARD_CASE, STANDARD_HYPERPARAMETERS
from app.services.statistical_validation import (
    DEFAULT_ALPHA,
    bootstrap_ci,
    cliffs_delta,
    holm_adjust,
    mean_ci,
    paired_wilcoxon,
    required_n,
    tost_paired,
)

# Factores del factorial 2⁴ de C3, en orden. La clave es la del caso **y** la del run en el
# payload, así que el diseño y el análisis hablan del mismo nombre.
FACTORS: tuple[tuple[str, float, float, float], ...] = (
    ("acoAlpha", 0.5, 2.0, 1.0),
    ("acoBeta", 1.0, 5.0, 3.0),
    ("acoRho", 0.05, 0.30, 0.12),
    ("acoPatience", 2, 10, 5),
)

FACTOR_SYMBOLS: dict[str, str] = {
    "acoAlpha": "α",
    "acoBeta": "β",
    "acoRho": "ρ",
    "acoPatience": "P",
    # Eje de iteraciones: solo lo usa el RSM de C5 (no es factor del factorial).
    "acoIterations": "I",
}

# Réplicas del punto central: control del diseño y estimación de error puro.
CENTER_REPLICATES = 4

# Perfil fijo del factorial: la perilla que no se varía es el presupuesto (C3.2 lo trata aparte).
_PROFILE: dict[str, int] = {
    "acoAnts": int(STANDARD_CASE["acoAnts"]),
    "acoIterations": int(STANDARD_CASE["acoIterations"]),
}

# Semillas del protocolo (números aleatorios comunes: las mismas para todos los puntos).
# Incluye la semilla histórica 42: la evidencia previa queda reutilizada como una réplica más.
PROTOCOL_SEEDS: tuple[int, ...] = (42, 101, 202, 303, 404, 505, 606, 707, 808, 909)

# Materialidad por defecto de δ: 1 % de la distancia de la referencia voraz (plan §C1).
DEFAULT_DELTA_PCT = 1.0

# Tolerancia relativa con la que se mide "cuándo llegó" una corrida.
CONVERGENCE_TOLERANCE = 0.01

# Perfil estándar de referencia (α1 β3 ρ0.12 Q1), el nivel «no mover la perilla».
_STANDARD_KNOBS: dict[str, float] = {
    "acoAlpha": float(STANDARD_HYPERPARAMETERS["acoAlpha"]),
    "acoBeta": float(STANDARD_HYPERPARAMETERS["acoBeta"]),
    "acoRho": float(STANDARD_HYPERPARAMETERS["acoRho"]),
    "pheromoneQ": float(STANDARD_HYPERPARAMETERS["pheromoneQ"]),
}


# --------------------------------------------------------------------------- #
# Diseño de casos (C3)
# --------------------------------------------------------------------------- #


def _format_value(value: float) -> str:
    return f"{value:g}"


def factorial_cases() -> list[dict[str, Any]]:
    """Factorial completo 2⁴ (α, β, ρ, paciencia) + 4 centros.

    Al ser un factorial **completo**, ningún efecto principal ni interacción de dos factores
    está aliaseado (resolución V por construcción), así que las diez conclusiones de C3 se
    pueden afirmar sin la coletilla de "salvo aliasing".

    Los centros son el perfil estándar replicado: sirven de control y de estimación de error
    puro, y permiten comprobar curvatura.
    """
    cases: list[dict[str, Any]] = []
    for combination in itertools.product((-1, 1), repeat=len(FACTORS)):
        values = {
            key: (low if level < 0 else high)
            for (key, low, high, _center), level in zip(FACTORS, combination, strict=True)
        }
        cases.append(
            {
                **values,
                **_PROFILE,
                "label": " ".join(
                    f"{FACTOR_SYMBOLS[key]}{_format_value(value)}" for key, value in values.items()
                ),
                "axis": "factorial",
            }
        )
    for index in range(CENTER_REPLICATES):
        cases.append(
            {
                **{key: center for key, _low, _high, center in FACTORS},
                **_PROFILE,
                "label": f"centro {index + 1} · perfil estándar",
                "axis": "center",
            }
        )
    return cases


def factorial_design() -> dict[str, Any]:
    """Descripción declarable del diseño (para el capítulo y para el reporte)."""
    return {
        "design": "factorial completo 2^4 + centros",
        "factors": {
            key: {"low": low, "high": high, "center": center}
            for key, low, high, center in FACTORS
        },
        "centerReplicates": CENTER_REPLICATES,
        "runs": len(factorial_cases()),
        "aliasing": "ninguno entre efectos principales y de dos factores (factorial completo)",
    }


# --------------------------------------------------------------------------- #
# Lectura del payload
# --------------------------------------------------------------------------- #


def _valid_runs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Corridas válidas: sin error y sin puntos sin cubrir (filtro de validez del plan)."""
    return [
        run
        for run in (payload.get("runs") or [])
        if not run.get("error") and not run.get("uncoveredPoints")
    ]


def _baseline_km(runs: list[dict[str, Any]]) -> float | None:
    """Distancia de la referencia voraz de la corrida (determinista dentro de la instancia)."""
    values = sorted(
        float(run["distanceKmBaseline"])
        for run in runs
        if run.get("distanceKmBaseline") is not None
    )
    if not values:
        return None
    return float(np.median(values))


def _default_delta(baseline: float | None) -> float | None:
    if baseline is None or baseline <= 0:
        return None
    return round(DEFAULT_DELTA_PCT * baseline / 100.0, 2)


def _iteration_to_within(series: list[dict[str, Any]], tolerance: float) -> int | None:
    """Primera iteración en la que la mejor distancia entra en ``tolerance`` de la final.

    ``bestDistanceKm`` es monótona no creciente, así que el mínimo de la serie es el valor
    final: la pregunta es cuántas ondas hicieron falta para alcanzarlo.
    """
    points = sorted(
        (int(point["iteration"]), float(point["bestDistanceKm"]))
        for point in series
        if point.get("iteration") is not None and point.get("bestDistanceKm") is not None
    )
    if not points:
        return None
    final = min(value for _iteration, value in points)
    target = final * (1 + tolerance)
    for iteration, value in points:
        if value <= target:
            return iteration
    return None


def _stats(values: list[float]) -> dict[str, Any]:
    sample = np.asarray(values, dtype=float)
    if sample.size == 0:
        return {"n": 0}
    result: dict[str, Any] = {
        "n": int(sample.size),
        "mean": round(float(np.mean(sample)), 2),
        "median": round(float(np.median(sample)), 2),
        "sd": round(float(np.std(sample, ddof=1)), 2) if sample.size > 1 else None,
        "min": round(float(np.min(sample)), 2),
        "max": round(float(np.max(sample)), 2),
        "iqr": round(float(np.percentile(sample, 75) - np.percentile(sample, 25)), 2),
        "cvPct": (
            round(float(np.std(sample, ddof=1)) / float(np.mean(sample)) * 100, 2)
            if sample.size > 1 and float(np.mean(sample)) > 0
            else None
        ),
    }
    interval = mean_ci(values)
    result["meanCi"] = (
        [round(interval[0], 2), round(interval[1], 2)] if interval is not None else None
    )
    result["meanCiHalfWidth"] = (
        round((interval[1] - interval[0]) / 2, 2) if interval is not None else None
    )
    return result


def _replicates_identical(
    by_config: dict[tuple[float, ...], dict[int, float]],
    centers: list[tuple[float, ...]],
) -> bool | None:
    """¿Las réplicas del centro dan exactamente lo mismo, semilla a semilla?

    Con números aleatorios comunes, repetir el mismo punto con las **mismas** semillas debe dar
    el mismo resultado: si no, algo del motor no es determinista y el protocolo entero (que
    apoya las comparaciones en el emparejamiento por semilla) se cae. Es la comprobación que
    sostiene la reproducibilidad, y explica por qué aquí **no** hay «error puro» clásico:
    réplicas idénticas no miden repetibilidad. Devuelve ``None`` si no hay con qué comparar.
    """
    if len(centers) < 2:
        return None
    reference = by_config[centers[0]]
    return all(by_config[key] == reference for key in centers[1:])


def _pooled_sd(groups: list[list[float]]) -> float | None:
    """DE combinada (dentro de grupo) de varios grupos de valores."""
    usable = [np.asarray(group, dtype=float) for group in groups if len(group) > 1]
    if not usable:
        return None
    numerator = sum(float(np.sum((group - group.mean()) ** 2)) for group in usable)
    denominator = sum(group.size - 1 for group in usable)
    if denominator <= 0:
        return None
    return round(float(np.sqrt(numerator / denominator)), 2)


# --------------------------------------------------------------------------- #
# Comparación pareada entre configuraciones (reutilizada por C3.2, C3.3 y C6)
# --------------------------------------------------------------------------- #


def _runs_by_signature(
    payload: dict[str, Any],
    signature: Callable[[dict[str, Any]], tuple[float, ...] | None],
) -> dict[tuple[float, ...], dict[int, dict[str, Any]]]:
    """Corridas válidas agrupadas por firma numérica, accesibles por semilla.

    La firma la declara cada fase: lo que **no** entra en ella es justamente lo que se está
    comparando (p. ej. la regla de parada en C3.3), de modo que las dos corridas de un par
    comparten semilla y difieren en el factor de interés.
    """
    grouped: dict[tuple[float, ...], dict[int, dict[str, Any]]] = {}
    for run in _valid_runs(payload):
        key = signature(run)
        seed = run.get("seed")
        if key is None or seed is None or run.get("distanceKmOptimized") is None:
            continue
        grouped.setdefault(key, {})[int(seed)] = run
    return grouped


def _shared_seeds(*groups: dict[int, Any]) -> list[int]:
    """Semillas presentes en **todos** los grupos (números aleatorios comunes)."""
    if not groups:
        return []
    return sorted(set.intersection(*(set(group) for group in groups)))


def _paired_delta(
    candidate: dict[int, float],
    reference: dict[int, float],
    seeds: list[int],
    delta: float | None,
) -> dict[str, Any]:
    """Δ pareado (candidato − referencia) con IC y equivalencia contra ±δ."""
    differences = [candidate[seed] - reference[seed] for seed in seeds]
    interval = bootstrap_ci(differences)
    within = (
        bool(delta is not None and interval and interval[0] > -delta and interval[1] < delta)
        if interval
        else None
    )
    return {
        "n": len(seeds),
        "medianKm": round(float(np.median(differences)), 2) if differences else None,
        "meanKm": round(float(np.mean(differences)), 2) if differences else None,
        "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
        "test": paired_wilcoxon(differences),
        "withinDelta": within,
    }


def _verdict_line(within: bool | None, median_km: float | None, delta: float | None) -> str:
    """Veredicto legible de un Δ pareado.

    El IC dentro de ±δ es la **equivalencia**; un IC que no cabe en ±δ con una mediana dentro
    del umbral no es «difiere», es «sin evidencia de equivalencia» (ausencia de evidencia ≠
    evidencia de ausencia, plan §3). Solo se declara «difiere» cuando la mediana supera δ.
    """
    if within is None or median_km is None or delta is None:
        return "— sin muestra"
    if within:
        return "equivalente"
    if abs(median_km) > delta:
        return "difiere"
    return "sin evidencia de equivalencia"


def _payload_comparisons(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    signature: Callable[[dict[str, Any]], tuple[float, ...] | None],
    delta: float | None,
    fallback_labels: dict[tuple[float, ...], str] | None = None,
) -> dict[str, Any]:
    """Comparación pareada por firma entre dos payloads (mismo par de semillas).

    Es el contraste que sostienen C3.3 (con corte vs sin corte), C4 (misma razón vs razón
    distinta) y C6 (control vs recomendado): en los tres casos las dos corridas comparten
    semilla y difieren en una sola cosa, así que el emparejamiento absorbe el ruido común.
    """
    candidate_groups = _runs_by_signature(candidate_payload, signature)
    reference_groups = _runs_by_signature(reference_payload, signature)
    comparisons: list[dict[str, Any]] = []
    for key, candidate in candidate_groups.items():
        reference = reference_groups.get(key)
        if reference is None:
            comparisons.append(
                {
                    "key": list(key),
                    "label": (fallback_labels or {}).get(key, " · ".join(_format_value(v) for v in key)),
                    "seeds": [],
                    "n": 0,
                    "medianKm": None,
                    "ci": None,
                    "withinDelta": None,
                    "verdict": "sin referencia",
                }
            )
            continue
        seeds = _shared_seeds(candidate, reference)
        candidate_values = {seed: candidate[seed]["distanceKmOptimized"] for seed in seeds}
        reference_values = {seed: reference[seed]["distanceKmOptimized"] for seed in seeds}
        delta_stats = _paired_delta(candidate_values, reference_values, seeds, delta)
        comparisons.append(
            {
                "key": list(key),
                "label": (fallback_labels or {}).get(
                    key, " · ".join(_format_value(value) for value in key)
                ),
                "seeds": seeds,
                **delta_stats,
                "candidateStats": _stats(list(candidate_values.values())),
                "referenceStats": _stats(list(reference_values.values())),
                "verdict": _verdict_line(
                    delta_stats["withinDelta"], delta_stats["medianKm"], delta
                ),
            }
        )
    comparisons.sort(key=lambda row: row["label"])
    return {
        "deltaKm": delta,
        "rule": "equivalencia = IC 95 % del Δ pareado contenido en ±δ; Δ = candidato − referencia",
        "comparisons": comparisons,
    }


# --------------------------------------------------------------------------- #
# C1 — Ruido base
# --------------------------------------------------------------------------- #


def analyze_noise(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C1 — Ruido base: dispersión entre semillas y umbrales derivados (δ y n).

    Mide el ruido **marginal** (entre semillas) de una única configuración. El ruido que
    gobierna las comparaciones entre configuraciones es el **pareado**, y solo se puede medir
    con dos configuraciones sobre las mismas semillas: esta fase da la cota pesimista
    (``√2 · s``) y C3 la ajusta con datos pareados.
    """
    runs = _valid_runs(payload)
    distances = sorted(
        float(run["distanceKmOptimized"])
        for run in runs
        if run.get("distanceKmOptimized") is not None
    )
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)

    analysis: dict[str, Any] = {
        "phase": "noise",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "seeds": sorted(int(run["seed"]) for run in runs if run.get("seed") is not None),
        "distances": distances,
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "runsTotal": len(payload.get("runs") or []),
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
        "stats": _stats(distances),
    }

    iterations = sorted(
        {int(run["acoIterationsRun"]) for run in runs if run.get("acoIterationsRun") is not None}
    )
    analysis["iterationsRun"] = iterations
    analysis["stoppedEarly"] = sum(1 for run in runs if run.get("acoStoppedEarly"))
    analysis["convergence"] = _convergence_summary(runs)

    # Comparación con el umbral heredado (0.5 % del mejor): era la regla de "eje estable".
    if distances:
        legacy = round(0.005 * distances[0], 2)
        sd = analysis["stats"].get("sd")
        analysis["legacyThreshold"] = {
            "rule": "0.5 % del mejor global",
            "km": legacy,
            "measuredSdKm": sd,
            "sdOverThreshold": round(sd / legacy, 2) if sd and legacy > 0 else None,
        }
        if sd is not None and delta:
            analysis["requiredSeeds"] = {
                "pairedVsDelta": required_n(sd, delta, paired=True),
                "unpairedVsDelta": required_n(sd, delta, paired=False),
                "current": analysis["stats"]["n"],
            }

    limitations = [
        (
            "El ruido pareado (el que gobierna las comparaciones entre configuraciones) no se mide "
            "con una sola configuración: aquí se reporta la cota pesimista √2·s. C3 lo ajusta."
        ),
        "Una sola instancia y un solo escenario: no hay generalización entre instancias.",
    ]
    if analysis["runsExcluded"]:
        limitations.append(
            f"{analysis['runsExcluded']} corrida(s) quedaron fuera del ranking (error o puntos sin cubrir)."
        )
    analysis["limitations"] = limitations
    return analysis


def _convergence_summary(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Cuándo llegó cada corrida a su valor final (y cuántas ondas hizo)."""
    iterations_to_final: list[int] = []
    for run in runs:
        series = run.get("acoConvergence") or []
        if not isinstance(series, list):
            continue
        iteration = _iteration_to_within(series, CONVERGENCE_TOLERANCE)
        if iteration is not None:
            iterations_to_final.append(iteration)
    if not iterations_to_final:
        return {"seriesAvailable": False}
    return {
        "seriesAvailable": True,
        "tolerance": CONVERGENCE_TOLERANCE,
        "medianIterationToFinal": float(np.median(iterations_to_final)),
        "maxIterationToFinal": max(iterations_to_final),
        "perRun": iterations_to_final,
    }


# --------------------------------------------------------------------------- #
# C3 — Factorial 2⁴ + centros
# --------------------------------------------------------------------------- #


def _config_key(run: dict[str, Any]) -> tuple[float, ...] | None:
    """Clave numérica del run: los cuatro factores en el orden del diseño."""
    values: list[float] = []
    for key, _low, _high, _center in FACTORS:
        raw = run.get(key)
        if raw is None:
            return None
        values.append(float(raw))
    return tuple(values)


def _coded_level(low: float, high: float, center: float, value: float) -> int | None:
    """Nivel codificado (−1/+1) o ``None`` si el valor es el central."""
    if abs(value - center) <= 1e-9:
        return None
    return -1 if abs(value - low) <= abs(value - high) else 1


def _design_label(params: tuple[float, ...], replicate: int) -> str | None:
    """Etiqueta del punto según el **diseño**, no según el rótulo de progreso del runner.

    El runner informa corridas y añade la semilla a su rótulo («α0.5 β1 ρ0.05 P2 · semilla 42»);
    esta tabla habla de configuraciones, así que el nombre se reconstruye desde los niveles y la
    semilla no se cuela en él. Devuelve ``None`` si el punto no pertenece al diseño declarado.
    """
    if len(params) != len(FACTORS):
        return None
    centers = [center for *_rest, center in FACTORS]
    if all(abs(value - center) <= 1e-9 for value, center in zip(params, centers, strict=True)):
        return f"centro {replicate + 1} · perfil estándar"
    parts: list[str] = []
    for (factor, low, high, _center), value in zip(FACTORS, params, strict=True):
        if abs(value - low) <= 1e-9:
            parts.append(f"{FACTOR_SYMBOLS[factor]}{_format_value(low)}")
        elif abs(value - high) <= 1e-9:
            parts.append(f"{FACTOR_SYMBOLS[factor]}{_format_value(high)}")
        else:
            return None
    return " ".join(parts)


def analyze_factorial(
    payload: dict[str, Any],
    *,
    delta_km: float | None = None,
    alpha: float = DEFAULT_ALPHA,
) -> dict[str, Any]:
    """C3 — Efectos, interacciones, curvatura, selección y convergencia del factorial.

    Los efectos se estiman como **contrastes ortogonales por semilla**: con 16 esquinas, el
    contraste de un factor es ``(1/8)·Σ signo·y``, calculado una vez por semilla. Eso da ``n``
    estimaciones del efecto (una por semilla) en lugar de una sola, y respeta el emparejamiento
    por números aleatorios comunes. La familia de contrastes es de **10** (4 principales + 6
    interacciones) y se ajusta con Holm.

    La clave de configuración es ``(parámetros…, réplica)``: los 4 puntos centrales comparten
    parámetros y deben seguir siendo cuatro corridas distintas.
    """
    runs = _valid_runs(payload)
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)

    by_config: dict[tuple[float, ...], dict[int, float]] = {}
    labels: dict[tuple[float, ...], str] = {}
    iterations: dict[tuple[float, ...], dict[int, int]] = {}
    occurrences: dict[tuple[float, ...], int] = {}
    for run in runs:
        params = _config_key(run)
        seed = run.get("seed")
        if params is None or run.get("distanceKmOptimized") is None or seed is None:
            continue
        # Los puntos centrales se replican **a propósito** (4 corridas con los mismos
        # parámetros), así que la clave de configuración no puede ser solo el vector de
        # parámetros: llevaría a fundir las 4 réplicas en una y se perdería el error puro. La
        # réplica se cuenta sobre ``(parámetros, semilla)`` —el diseño tiene la misma estructura
        # en todas las semillas— de modo que no depende de la etiqueta ni del orden global.
        counter = (*params, float(seed))
        replicate = occurrences.get(counter, 0)
        occurrences[counter] = replicate + 1
        key = (*params, float(replicate))
        by_config.setdefault(key, {})[int(seed)] = float(run["distanceKmOptimized"])
        if run.get("acoIterationsRun") is not None:
            iterations.setdefault(key, {})[int(seed)] = int(run["acoIterationsRun"])
        labels.setdefault(
            key, _design_label(params, replicate) or str(run.get("label") or "corrida")
        )

    corners: list[tuple[float, ...]] = []
    centers: list[tuple[float, ...]] = []
    coded: dict[tuple[float, ...], tuple[int | None, ...]] = {}
    for key in by_config:
        levels = tuple(
            _coded_level(low, high, center, key[index])
            for index, (_factor, low, high, center) in enumerate(FACTORS)
        )
        coded[key] = levels
        if any(level is None for level in levels):
            centers.append(key)
        else:
            corners.append(key)

    analysis: dict[str, Any] = {
        "phase": "factorial",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "design": factorial_design(),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
        "corners": len(corners),
        "centers": len(centers),
    }

    if len(corners) != 2 ** len(FACTORS) or not centers:
        analysis["comparable"] = False
        analysis["reason"] = (
            f"Diseño incompleto: {len(corners)} esquinas y {len(centers)} centros de "
            f"{2 ** len(FACTORS)} + {CENTER_REPLICATES} esperados. Sin las esquinas no hay "
            "contrastes ortogonales."
        )
        return analysis

    seeds = sorted(set.intersection(*(set(by_config[key]) for key in by_config)))
    if len(seeds) < 2:
        analysis["comparable"] = False
        analysis["reason"] = "Las configuraciones no comparten al menos 2 semillas: no hay comparación pareada."
        return analysis
    analysis["comparable"] = True
    analysis["seeds"] = seeds

    configs = _factorial_configs(by_config, iterations, coded, labels, centers, seeds, delta)
    analysis["configs"] = [row for _key, row in configs]
    analysis["contrasts"] = _factorial_contrasts(by_config, coded, list(by_config), seeds, alpha)
    analysis["curvature"] = _factorial_curvature(by_config, corners, centers, seeds)
    analysis["noise"] = {
        "centerSdAcrossSeeds": _pooled_sd([list(by_config[key].values()) for key in centers]),
        "centerReplicatesIdentical": _replicates_identical(by_config, centers),
        "marginalSd": _stats([value for key in by_config for value in by_config[key].values()]).get("sd"),
    }
    analysis["convergence"] = _convergence_summary(runs)
    analysis["selection"] = _factorial_selection(configs, by_config, seeds, delta)
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: los efectos medidos son de esta instancia.",
        "El presupuesto (hormigas × iteraciones) es fijo dentro del diseño; su eje se trata en C3.2.",
        (
            "Un factor por corrida no distingue iteraciones efectivas de paciencia: la paciencia "
            "recorta unas corridas y otras no, y por eso se reporta la iteración efectiva."
        ),
        (
            "Con números aleatorios comunes, las 4 réplicas del centro son la misma corrida "
            "repetida: verifican determinismo del motor, pero no añaden error puro ni precisión."
        ),
    ]
    return analysis


def _factorial_configs(
    by_config: dict[tuple[float, ...], dict[int, float]],
    iterations: dict[tuple[float, ...], dict[int, int]],
    coded: dict[tuple[float, ...], tuple[int | None, ...]],
    labels: dict[tuple[float, ...], str],
    centers: list[tuple[float, ...]],
    seeds: list[int],
    delta: float | None,
) -> list[tuple[tuple[float, ...], dict[str, Any]]]:
    """Tabla por configuración: mediana, dispersión, Δ pareado contra el centro y coste.

    Devuelve pares ``(clave, fila)`` para que quien llame siga emparejando por clave numérica
    y no por etiqueta (las etiquetas son únicas, pero son texto).

    Incluye las **iteraciones efectivas** (mediana): la paciencia es un factor del diseño, así
    que dos configuraciones con la misma distancia no cuestan lo mismo.
    """
    reference = centers[0] if centers else None
    reference_values = by_config[reference] if reference is not None else None
    rows: list[tuple[tuple[float, ...], dict[str, Any]]] = []
    for key, series in by_config.items():
        values = [series[seed] for seed in seeds]
        row: dict[str, Any] = {
            "label": labels[key],
            "params": {
                factor: value
                for (factor, *_rest), value in zip(
                    FACTORS, key[: len(FACTORS)], strict=True
                )
            },
            "levels": list(coded[key]),
            "isCenter": key in centers,
            "stats": _stats(values),
            "iterations": _iterations_summary(iterations, key, seeds),
        }
        if reference_values is not None and key != reference:
            differences = [series[seed] - reference_values[seed] for seed in seeds]
            interval = bootstrap_ci(differences)
            row["deltaVsCenter"] = {
                "medianKm": round(float(np.median(differences)), 2),
                "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
                "withinDelta": (
                    bool(interval and interval[0] > -delta and interval[1] < delta)
                    if delta is not None and interval
                    else None
                ),
                "cliffsDelta": _rounded(
                    cliffs_delta(values, [reference_values[seed] for seed in seeds])
                ),
            }
        rows.append((key, row))
    rows.sort(key=lambda item: (item[1]["stats"]["median"], item[1]["label"]))
    return rows


def _factorial_contrasts(
    by_config: dict[tuple[float, ...], dict[int, float]],
    coded: dict[tuple[float, ...], tuple[int | None, ...]],
    keys: list[tuple[float, ...]],
    seeds: list[int],
    alpha: float,
) -> list[dict[str, Any]]:
    """Efectos principales e interacciones de dos factores, por semilla y con Holm.

    En un factorial completo los contrastes son ortogonales: el efecto de un factor es
    ``(1/8)·Σ signo·y`` sobre las 16 esquinas, y el de una interacción usa el producto de los
    dos signos. Calculado una vez por semilla, da ``n`` estimaciones por efecto.
    """
    corner_keys = [key for key in keys if all(level is not None for level in coded[key])]
    names = [factor for factor, *_rest in FACTORS]
    divisor = float(len(corner_keys) / 2)
    definitions: list[tuple[str, str, str, list[int]]] = [
        ("main", names[index], names[index], [index]) for index in range(len(FACTORS))
    ]
    definitions.extend(
        (
            "interaction",
            f"{names[left]}x{names[right]}",
            f"{names[left]} × {names[right]}",
            [left, right],
        )
        for left in range(len(FACTORS))
        for right in range(left + 1, len(FACTORS))
    )

    contrasts: list[dict[str, Any]] = []
    for kind, code, label, indexes in definitions:
        signs = [math.prod(_sign(coded[key][index]) for index in indexes) for key in corner_keys]
        per_seed = [
            sum(
                sign * by_config[key][seed]
                for sign, key in zip(signs, corner_keys, strict=True)
            )
            / divisor
            for seed in seeds
        ]
        interval = bootstrap_ci(per_seed)
        contrasts.append(
            {
                "kind": kind,
                "code": code,
                "label": label,
                "medianKm": round(float(np.median(per_seed)), 2),
                "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
                "test": paired_wilcoxon(per_seed),
                "perSeed": [round(value, 2) for value in per_seed],
            }
        )

    adjusted = holm_adjust([contrast["test"]["pValue"] for contrast in contrasts])
    for contrast, p_value in zip(contrasts, adjusted, strict=True):
        contrast["pValueHolm"] = round(p_value, 5) if p_value is not None else None
        contrast["significant"] = bool(p_value is not None and p_value < alpha)
    contrasts.sort(key=lambda contrast: abs(contrast["medianKm"]), reverse=True)
    return contrasts


def _sign(level: int | None) -> int:
    return 0 if level is None else int(level)


def _factorial_curvature(
    by_config: dict[tuple[float, ...], dict[int, float]],
    corners: list[tuple[float, ...]],
    centers: list[tuple[float, ...]],
    seeds: list[int],
) -> dict[str, Any]:
    """Curvatura: los centros frente al promedio de las esquinas (pareado por semilla)."""
    differences = [
        float(np.mean([by_config[key][seed] for key in centers]))
        - float(np.mean([by_config[key][seed] for key in corners]))
        for seed in seeds
    ]
    interval = bootstrap_ci(differences)
    return {
        "medianKm": round(float(np.median(differences)), 2),
        "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
        "test": paired_wilcoxon(differences),
        "reading": "positivo = los centros rinden peor que el promedio de las esquinas",
    }


def _factorial_selection(
    configs: list[tuple[tuple[float, ...], dict[str, Any]]],
    by_config: dict[tuple[float, ...], dict[int, float]],
    seeds: list[int],
    delta: float | None,
) -> dict[str, Any]:
    """Mejor configuración y **región estadísticamente equivalente** (IC dentro de ±δ).

    La comparación es pareada contra la mejor mediana (mismas semillas). Entre equivalentes
    decide el coste: primero la mediana, después las **iteraciones efectivas** (la paciencia es lo
    que se paga) y solo entonces el orden alfabético. Nunca "el primero del orden".
    """
    if not configs:
        return {"available": False}
    best_key, best_row = configs[0]
    best_values = by_config[best_key]
    equivalent: list[dict[str, Any]] = []
    for key, row in configs:
        differences = [by_config[key][seed] - best_values[seed] for seed in seeds]
        interval = bootstrap_ci(differences)
        equivalent.append(
            {
                "label": row["label"],
                "params": row["params"],
                "medianKm": row["stats"]["median"],
                "iterationsMedian": row.get("iterations", {}).get("median"),
                "deltaMedianKm": round(float(np.median(differences)), 2),
                "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
                "withinDelta": bool(
                    interval and delta is not None and interval[0] > -delta and interval[1] < delta
                ),
            }
        )
    candidates = [row for row in equivalent if row["withinDelta"]]
    cheapest = (
        min(
            candidates,
            key=lambda row: (
                row["medianKm"],
                row["iterationsMedian"] if row["iterationsMedian"] is not None else 0.0,
                row["label"],
            ),
        )
        if candidates
        else None
    )
    return {
        "available": True,
        "best": {"label": best_row["label"], "medianKm": best_row["stats"]["median"]},
        "deltaKm": delta,
        "equivalent": equivalent,
        "equivalentCount": len(candidates),
        "cheapestEquivalent": cheapest,
        "rule": "equivalencia = IC 95 % del Δ pareado contenido en ±δ; empate = menor mediana y "
        "después coste (iteraciones efectivas)",
    }


def _iterations_summary(
    iterations: dict[tuple[float, ...], dict[int, int]],
    key: tuple[float, ...],
    seeds: list[int],
) -> dict[str, Any]:
    """Ondas efectivamente ejecutadas por configuración (la paciencia corta distinto).

    El rango (min–max) es la señal de que la regla de parada está actuando: dos
    configuraciones pueden empatar en distancia y costar muy distinto.
    """
    values = [iterations.get(key, {}).get(seed) for seed in seeds]
    usable = [value for value in values if value is not None]
    if not usable:
        return {"median": None, "min": None, "max": None}
    return {"median": float(np.median(usable)), "min": min(usable), "max": max(usable)}


# --------------------------------------------------------------------------- #
# C3.2 — Eje de presupuesto (hormigas × iteraciones)
# --------------------------------------------------------------------------- #

# Puntos del eje. Los tres primeros gastan el **mismo trabajo** (240 ant-iteraciones) y lo
# reparten de distinta forma; los dos últimos suben el techo de iteraciones, que es lo que
# permite decidir si el presupuesto de comparación sube (hallazgo H6).
BUDGET_POINTS: tuple[tuple[int, int], ...] = (
    (8, 30),
    (12, 20),
    (20, 12),
    (12, 40),
    (20, 40),
)
BUDGET_REFERENCE: tuple[int, int] = (12, 20)
BUDGET_FIXED_WORK = 240
BUDGET_GROWING_ARM: tuple[tuple[tuple[int, int], tuple[int, int]], ...] = (
    ((12, 20), (12, 40)),
    ((20, 12), (20, 40)),
)


def _budget_label(point: tuple[int, int]) -> str:
    ants, iterations = point
    if point == BUDGET_REFERENCE:
        return f"{ants}×{iterations} (referencia)"
    if ants * iterations > BUDGET_FIXED_WORK:
        return f"{ants}×{iterations} (creciente)"
    return f"{ants}×{iterations}"


def budget_cases(*, patience: int = 0) -> list[dict[str, Any]]:
    """C3.2 — Eje de presupuesto a trabajo fijo, más el brazo creciente de 40 iteraciones.

    El resto del perfil queda en el estándar (α1 β3 ρ0.12 Q1). La paciencia se fija
    **explícitamente** en todas las corridas: el eje mide el reparto del presupuesto, no el
    recorte por estancamiento, y con ``patience = 0`` cada corrida agota sus iteraciones —
    que es la única forma de saber si subir el techo a 40 compra algo (hallazgo H4).
    """
    cases: list[dict[str, Any]] = []
    for point in BUDGET_POINTS:
        ants, iterations = point
        cases.append(
            {
                **_STANDARD_KNOBS,
                "acoAnts": ants,
                "acoIterations": iterations,
                "acoPatience": int(patience),
                "axis": "budget",
                "workUnits": ants * iterations,
                "label": _budget_label(point),
            }
        )
    return cases


def _budget_signature(run: dict[str, Any]) -> tuple[float, ...] | None:
    ants = run.get("acoAnts")
    iterations = run.get("acoIterations")
    if ants is None or iterations is None:
        return None
    return (float(ants), float(iterations))


def _median_of(group: dict[int, dict[str, Any]], seeds: list[int], field: str) -> float | None:
    values = [
        float(group[seed][field])
        for seed in seeds
        if group[seed].get(field) is not None
    ]
    return round(float(np.median(values)), 2) if values else None


def _effective_iterations(group: dict[int, dict[str, Any]], seeds: list[int]) -> dict[str, Any]:
    values = [
        int(group[seed]["acoIterationsRun"])
        for seed in seeds
        if group[seed].get("acoIterationsRun") is not None
    ]
    if not values:
        return {"median": None, "min": None, "max": None}
    return {"median": float(np.median(values)), "min": min(values), "max": max(values)}


def analyze_budget(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C3.2 — Reparto del presupuesto y decisión sobre el techo de iteraciones.

    Compara los tres puntos de trabajo fijo entre sí (y contra la referencia ``(12, 20)``) de
    forma **pareada por semilla**, reporta las **iteraciones efectivas** de cada punto (la
    señal de H6: comparar trabajo distinto creyendo comparar hormigas) y contrasta el brazo
    creciente ``(H, 40)`` contra su pareja de trabajo fijo.

    Regla declarada: **el techo sube a 40 solo si la mediana con 40 mejora más de δ**; si el
    brazo creciente queda dentro de ±δ, se conserva 20 por coste.
    """
    runs = _valid_runs(payload)
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)
    by_point = _runs_by_signature(payload, _budget_signature)

    analysis: dict[str, Any] = {
        "phase": "budget",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "reference": list(BUDGET_REFERENCE),
        "fixedWorkUnits": BUDGET_FIXED_WORK,
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
        "design": {
            "points": [[ants, iterations] for ants, iterations in BUDGET_POINTS],
            "fixedWork": [[ants, iterations] for ants, iterations in BUDGET_POINTS if ants * iterations == BUDGET_FIXED_WORK],
            "growingArm": [[list(low), list(high)] for low, high in BUDGET_GROWING_ARM],
        },
    }

    missing = [point for point in BUDGET_POINTS if point not in by_point]
    if missing:
        analysis["comparable"] = False
        analysis["reason"] = (
            "Faltan puntos del eje de presupuesto: "
            + ", ".join(f"({ants}, {iterations})" for ants, iterations in missing)
            + ". Sin los cinco puntos no hay decisión de presupuesto."
        )
        return analysis

    seeds = _shared_seeds(*by_point.values())
    if len(seeds) < 2:
        analysis["comparable"] = False
        analysis["reason"] = "Los puntos del eje no comparten al menos 2 semillas: no hay comparación pareada."
        return analysis
    analysis["comparable"] = True
    analysis["seeds"] = seeds

    reference = by_point[BUDGET_REFERENCE]
    reference_values = {seed: reference[seed]["distanceKmOptimized"] for seed in seeds}
    points: list[dict[str, Any]] = []
    for point in BUDGET_POINTS:
        group = by_point[point]
        values = {seed: group[seed]["distanceKmOptimized"] for seed in seeds}
        delta_stats = _paired_delta(values, reference_values, seeds, delta)
        points.append(
            {
                "ants": point[0],
                "iterations": point[1],
                "workUnits": point[0] * point[1],
                "label": _budget_label(point),
                "isReference": point == BUDGET_REFERENCE,
                "stats": _stats(list(values.values())),
                "iterationsEffective": _effective_iterations(group, seeds),
                "acoSecondsMedian": _median_of(group, seeds, "acoSeconds"),
                **delta_stats,
                "verdict": _verdict_line(delta_stats["withinDelta"], delta_stats["medianKm"], delta),
            }
        )
    analysis["points"] = points
    fixed_rows = [row for row in points if row["workUnits"] == BUDGET_FIXED_WORK]
    equivalent = [row for row in fixed_rows if row["withinDelta"]]
    cheapest = (
        min(equivalent, key=lambda row: (row["ants"], row["iterations"])) if equivalent else None
    )
    measured = [row for row in equivalent if row["acoSecondsMedian"] is not None]
    measured_cheapest = (
        min(measured, key=lambda row: (row["acoSecondsMedian"], row["ants"]))
        if measured
        else None
    )
    analysis["fixedWork"] = {
        "points": [row["label"] for row in fixed_rows],
        "equivalentCount": len(equivalent),
        "equivalent": [row["label"] for row in equivalent],
        "cheapestEquivalent": cheapest,
        "measuredCheapest": measured_cheapest,
        "rule": "entre equivalentes decide el coste: menos hormigas, después menos iteraciones",
    }
    analysis["growingArm"] = _budget_growing_arm(by_point, seeds, delta)
    raises = [row for row in analysis["growingArm"] if row["improvesBeyondDelta"]]
    analysis["decision"] = {
        "iterationsCeiling": 40 if raises else 20,
        "raised": bool(raises),
        "rule": "se sube el techo a 40 solo si la mediana con 40 mejora más de δ",
        "evidence": [row["label"] for row in raises],
        "cheapestEquivalent": cheapest["label"] if cheapest else None,
        "summary": (
            "I = 40 (el brazo creciente mejora más de δ en " + ", ".join(row["label"] for row in raises) + ")"
            if raises
            else "I = 20 (el brazo creciente no mejora más de δ)"
        ),
    }
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: la forma del eje es de esta instancia.",
        (
            "La paciencia se fija en 0 (sin corte) para que el eje mida el reparto del "
            "presupuesto y no el recorte por estancamiento; con corte, la iteración efectiva "
            "dependería de cada punto."
        ),
        "El coste se declara en ant-iteraciones (independiente de la máquina); los segundos son informativos.",
    ]
    warnings: list[str] = []
    if (
        cheapest is not None
        and measured_cheapest is not None
        and (measured_cheapest["ants"], measured_cheapest["iterations"])
        != (cheapest["ants"], cheapest["iterations"])
    ):
        warnings.append(
            f"El punto más barato por la regla declarada es {cheapest['label']}, pero el de "
            f"menos segundos de ACO medidos es {measured_cheapest['label']} "
            f"({measured_cheapest['acoSecondsMedian']} s). Los segundos incluyen la sobrecarga "
            "por iteración y dependen de la máquina (H7): la regla de decisión sigue siendo el "
            "coste declarado en ant-iteraciones."
        )
    analysis["warnings"] = warnings
    return analysis


def _budget_growing_arm(
    by_point: dict[tuple[float, ...], dict[int, dict[str, Any]]],
    seeds: list[int],
    delta: float | None,
) -> list[dict[str, Any]]:
    """Contraste del brazo creciente ``(H, 40)`` contra su pareja de trabajo fijo.

    Δ = 40 iteraciones − techo anterior, a **mismas hormigas**. ``improvesBeyondDelta`` es la
    regla de decisión: solo se sube si la mediana mejora más de δ (no basta con que sea mejor).
    """
    arm: list[dict[str, Any]] = []
    for low, high in BUDGET_GROWING_ARM:
        low_group = by_point.get((float(low[0]), float(low[1])))
        high_group = by_point.get((float(high[0]), float(high[1])))
        if low_group is None or high_group is None:
            continue
        pair_seeds = _shared_seeds(low_group, high_group)
        high_values = {seed: high_group[seed]["distanceKmOptimized"] for seed in pair_seeds}
        low_values = {seed: low_group[seed]["distanceKmOptimized"] for seed in pair_seeds}
        delta_stats = _paired_delta(high_values, low_values, pair_seeds, delta)
        improves = bool(
            delta is not None and delta_stats["medianKm"] is not None and delta_stats["medianKm"] < -delta
        )
        arm.append(
            {
                "label": f"{_budget_label(low)} → {_budget_label(high)}",
                "low": list(low),
                "high": list(high),
                "seeds": pair_seeds,
                **delta_stats,
                "improvesBeyondDelta": improves,
                "verdict": (
                    "sube"
                    if improves
                    else "se queda"
                    if delta_stats["withinDelta"]
                    else "mejora < δ"
                    if (delta_stats["medianKm"] or 0.0) < 0
                    else "no mejora"
                ),
            }
        )
    return arm


# --------------------------------------------------------------------------- #
# C3.3 — Brazo de control sin corte
# --------------------------------------------------------------------------- #


def _matching_signature(run: dict[str, Any]) -> tuple[float, ...] | None:
    """Firma de una corrida **sin la regla de parada** (es lo que se compara en C3.3).

    Dos corridas con la misma α, β, ρ, Q y presupuesto son el mismo punto del motor; la única
    diferencia admisible entre el brazo sin corte y su referencia es la paciencia.
    """
    values: list[float] = []
    for key in ("acoAlpha", "acoBeta", "acoRho", "pheromoneQ"):
        raw = run.get(key, _STANDARD_KNOBS[key])
        if raw is None:
            return None
        values.append(float(raw))
    for key in ("acoAnts", "acoIterations"):
        raw = run.get(key)
        if raw is None:
            return None
        values.append(float(raw))
    return tuple(values)


def _knob_label(signature: tuple[float, ...]) -> str:
    alpha, beta, rho, q, ants, iterations = signature
    return (
        f"α{_format_value(alpha)} β{_format_value(beta)} ρ{_format_value(rho)} "
        f"Q{_format_value(q)} · {ants:g}×{iterations:g}"
    )


def best_config_from_factorial(analysis: dict[str, Any]) -> dict[str, Any] | None:
    """Parámetros de la mejor configuración medida en C3 (la de menor mediana).

    No se copia la fila: se devuelven solo las **perillas** de C3, que es lo que el brazo sin
    corte necesita replicar. Si el factorial no es comparable no hay mejor configuración que
    heredar y se devuelve ``None``.
    """
    if not analysis.get("comparable"):
        return None
    best = (analysis.get("selection") or {}).get("best")
    if not best:
        return None
    for row in analysis.get("configs") or []:
        if row.get("label") == best.get("label"):
            return dict(row.get("params") or {})
    return None


def no_cut_cases(best_config: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """C3.3 — Perfil estándar y mejor configuración de C3, ambos sin corte (``acoPatience = 0``).

    Con la regla de parada desactivada cada corrida agota sus iteraciones, así que el brazo
    mide exactamente **cuánta calidad deja sobre la mesa** el early-stop: mismo motor, mismo
    presupuesto, misma semilla, distinta regla de parada (plan §C3.3).
    """
    cases: list[dict[str, Any]] = [
        {
            **_STANDARD_KNOBS,
            **STANDARD_CASE,
            "acoPatience": 0,
            "axis": "nocut",
            "label": "perfil estándar (sin corte)",
        }
    ]
    if best_config:
        knobs = {
            key: float(best_config[key])
            for key in _STANDARD_KNOBS
            if best_config.get(key) is not None
        }
        cases.append(
            {
                **_STANDARD_KNOBS,
                **knobs,
                **_PROFILE,
                "acoPatience": 0,
                "axis": "nocut",
                "label": (
                    "mejor de C3 "
                    + " ".join(
                        f"{name}{_format_value(value)}"
                        for name, value in (
                            ("α", knobs.get("acoAlpha", _STANDARD_KNOBS["acoAlpha"])),
                            ("β", knobs.get("acoBeta", _STANDARD_KNOBS["acoBeta"])),
                            ("ρ", knobs.get("acoRho", _STANDARD_KNOBS["acoRho"])),
                            ("Q", knobs.get("pheromoneQ", _STANDARD_KNOBS["pheromoneQ"])),
                        )
                    )
                    + " (sin corte)"
                ),
            }
        )
    return cases


def analyze_no_cut(
    payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    delta_km: float | None = None,
) -> dict[str, Any]:
    """C3.3 — Δ pareado (sin corte − con corte) por configuración.

    El contraste empareja por semilla y por firma sin la regla de parada: la misma corrida con
    el corte apagado contra la que sí cortó. Cuantifica cuánta calidad deja sobre la mesa el
    early-stop y cuántas ondas ahorra, que es la información que el plan pide para decidir si
    la regla de parada se queda en el protocolo de comparación.
    """
    runs = _valid_runs(payload)
    reference_runs = _valid_runs(reference_payload)
    baseline = _baseline_km(runs) or _baseline_km(reference_runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)

    candidate_groups = _runs_by_signature(payload, _matching_signature)
    reference_groups = _runs_by_signature(reference_payload, _matching_signature)
    labels = {key: _knob_label(key) for key in candidate_groups}
    comparison = _payload_comparisons(
        payload,
        reference_payload,
        signature=_matching_signature,
        delta=delta,
        fallback_labels=labels,
    )

    analysis: dict[str, Any] = {
        "phase": "nocut",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "referenceGeneratedAt": reference_payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "rule": "Δ = sin corte − con corte; el IC 95 % dentro de ±δ declara equivalencia",
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
    }

    usable = [
        row
        for row in comparison["comparisons"]
        if row["n"] >= 2 and tuple(row["key"]) in candidate_groups and tuple(row["key"]) in reference_groups
    ]
    if not usable:
        analysis["comparable"] = False
        analysis["reason"] = (
            "Ninguna configuración del brazo sin corte empareja con la evidencia de referencia "
            "(misma α, β, ρ, Q y presupuesto) con al menos 2 semillas compartidas. "
            "Revisa que la referencia sea el factorial citable."
        )
        return analysis

    analysis["comparable"] = True
    analysis["seeds"] = sorted({seed for row in usable for seed in row["seeds"]})
    rows: list[dict[str, Any]] = []
    for row in usable:
        key = tuple(row["key"])
        candidate = candidate_groups[key]
        reference = reference_groups[key]
        candidate_iterations = _effective_iterations(candidate, row["seeds"])
        reference_iterations = _effective_iterations(reference, row["seeds"])
        improves = bool(delta is not None and row["medianKm"] is not None and row["medianKm"] < -delta)
        rows.append(
            {
                "label": row["label"],
                "params": {
                    "acoAlpha": key[0],
                    "acoBeta": key[1],
                    "acoRho": key[2],
                    "pheromoneQ": key[3],
                    "acoAnts": int(key[4]),
                    "acoIterations": int(key[5]),
                },
                "seeds": row["seeds"],
                "n": row["n"],
                "noCutStats": row["candidateStats"],
                "withCutStats": row["referenceStats"],
                "noCutIterations": candidate_iterations,
                "withCutIterations": reference_iterations,
                "iterationsSavedMedian": None,
                "medianKm": row["medianKm"],
                "ci": row["ci"],
                "test": row["test"],
                "withinDelta": row["withinDelta"],
                "improvesBeyondDelta": improves,
                "verdict": (
                    "el corte cuesta > δ"
                    if improves
                    else "equivalente"
                    if row["withinDelta"]
                    else "sin evidencia de equivalencia"
                ),
            }
        )
    for row in rows:
        # Ondas que la regla de parada ahorra (positivo = el corte ahorró ondas).
        no_cut = row["noCutIterations"].get("median")
        with_cut = row["withCutIterations"].get("median")
        row["iterationsSavedMedian"] = (
            round(float(no_cut) - float(with_cut), 2)
            if no_cut is not None and with_cut is not None
            else None
        )
    rows.sort(key=lambda row: row["label"])
    analysis["comparisons"] = rows
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: el coste del early-stop es de esta instancia.",
        (
            "Sin corte cada corrida agota sus iteraciones, así que el brazo sin corte cuesta más "
            "ondas que su referencia: el contraste mide calidad comprada con presupuesto, no un "
            "empate de coste."
        ),
        "El mejor de C3 se hereda del factorial; si el factorial no es comparable, no se lanza este brazo.",
    ]
    return analysis


# --------------------------------------------------------------------------- #
# C4 — Identificación: razón r = β/α y validación de Q
# --------------------------------------------------------------------------- #

# Perfil fijo de C4: ρ y paciencia declarados, presupuesto estándar.
_RATIO_PROFILE: dict[str, Any] = {
    "acoRho": float(STANDARD_HYPERPARAMETERS["acoRho"]),
    "acoPatience": 5,
    **_PROFILE,
}

# Puntos de identificación. Cada tupla es (α, β, Q):
# - dos pares con r = β/α constante y nitidez distinta (α1·β5 y α2·β10; α1·β2.5 y α2·β5),
# - y Q ∈ {0.5, 2} sobre el perfil estándar α1 β3.
RATIO_POINTS: tuple[tuple[float, float, float], ...] = (
    (1.0, 5.0, 1.0),
    (2.0, 10.0, 1.0),
    (1.0, 2.5, 1.0),
    (2.0, 5.0, 1.0),
    (1.0, 3.0, 0.5),
    (1.0, 3.0, 2.0),
)

# Familia de contrastes **pre-declarada** (plan §C4). Δ = izquierda − derecha.
RATIO_CONTRASTS: tuple[dict[str, Any], ...] = (
    {
        "code": "ratioWithin5",
        "kind": "withinRatio",
        "expectation": "equivalente",
        "left": (1.0, 5.0, 1.0),
        "right": (2.0, 10.0, 1.0),
        "label": "(α1 β5) vs (α2 β10) · misma r = 5",
        "reading": "misma razón, distinta nitidez: deben ser equivalentes si gobierna r",
    },
    {
        "code": "ratioWithin2.5",
        "kind": "withinRatio",
        "expectation": "equivalente",
        "left": (1.0, 2.5, 1.0),
        "right": (2.0, 5.0, 1.0),
        "label": "(α1 β2.5) vs (α2 β5) · misma r = 2.5",
        "reading": "misma razón, distinta nitidez: deben ser equivalentes si gobierna r",
    },
    {
        "code": "ratioBetween",
        "kind": "betweenRatio",
        "expectation": "difiere",
        "left": (2.0, 5.0, 1.0),
        "right": (1.0, 5.0, 1.0),
        "label": "(α2 β5) vs (α1 β5) · r = 2.5 vs r = 5",
        "reading": "misma β, distinta razón: debe diferir si gobierna r",
    },
    {
        "code": "q",
        "kind": "q",
        "expectation": "equivalente",
        "left": (1.0, 3.0, 0.5),
        "right": (1.0, 3.0, 2.0),
        "label": "Q0.5 vs Q2 · perfil estándar",
        "reading": "Q escala el depósito de feromona de forma casi uniforme: debe ser inerte",
    },
)


def ratio_cases() -> list[dict[str, Any]]:
    """C4 — Seis puntos para desdoblar ``r = β/α`` y validar ``Q``.

    El diseño separa **razón** (r) de **nitidez** (α): si el orden de preferencia lo fija r, los
    pares con la misma razón deben rendir igual aunque α cambie. Los dos puntos de Q usan el
    perfil estándar α1 β3, que es el centro del factorial (Q = 1).
    """
    cases: list[dict[str, Any]] = []
    for alpha, beta, q in RATIO_POINTS:
        ratio = beta / alpha
        if q != 1.0:
            label = f"Q{_format_value(q)} · α{_format_value(alpha)} β{_format_value(beta)}"
        else:
            label = f"r{_format_value(ratio)} · α{_format_value(alpha)} β{_format_value(beta)}"
        cases.append(
            {
                **_STANDARD_KNOBS,
                **_RATIO_PROFILE,
                "acoAlpha": alpha,
                "acoBeta": beta,
                "pheromoneQ": q,
                "axis": "ratio",
                "ratio": ratio,
                "label": label,
            }
        )
    return cases


def _ratio_signature(run: dict[str, Any]) -> tuple[float, ...] | None:
    values: list[float] = []
    for key in ("acoAlpha", "acoBeta"):
        raw = run.get(key)
        if raw is None:
            return None
        values.append(float(raw))
    q = run.get("pheromoneQ", _STANDARD_KNOBS["pheromoneQ"])
    rho = run.get("acoRho", _STANDARD_KNOBS["acoRho"])
    if q is None or rho is None:
        return None
    values.extend((float(rho), float(q)))
    return tuple(values)


def _contrast_satisfied(
    expectation: str,
    within: bool | None,
    median_km: float | None,
    delta: float | None,
) -> bool | None:
    """¿El contraste cumple lo pre-declarado? ``None`` si no hay muestra para decidir."""
    if within is None or median_km is None or delta is None:
        return None
    if expectation == "equivalente":
        return bool(within)
    return bool(abs(median_km) > delta)


def analyze_ratio(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C4 — ¿Gobierna la razón ``r = β/α`` el orden, y es ``Q`` inerte dentro del ruido?

    Contrastes pre-declarados y pareados por semilla (mismos números aleatorios comunes):

    - **dentro de r** (α1β5 vs α2β10 y α1β2.5 vs α2β5): deben ser **equivalentes**;
    - **entre r** (α2β5 vs α1β5): debe **diferir** más de δ;
    - **Q** (Q0.5 vs Q2): debe ser **equivalente**.

    Holm sobre la familia de 4. La equivalencia se declara con el IC 95 % del Δ pareado dentro
    de ±δ, nunca con un test no significativo.
    """
    runs = _valid_runs(payload)
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)
    by_signature = _runs_by_signature(payload, _ratio_signature)
    expected = {
        point for contrast in RATIO_CONTRASTS for point in (contrast["left"], contrast["right"])
    }
    expected_signatures = {
        (alpha, beta, float(_RATIO_PROFILE["acoRho"]), q) for alpha, beta, q in expected
    }

    analysis: dict[str, Any] = {
        "phase": "identify",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
        "design": {
            "points": [list(point) for point in RATIO_POINTS],
            "profile": dict(_RATIO_PROFILE),
            "family": [contrast["code"] for contrast in RATIO_CONTRASTS],
        },
    }

    missing = sorted(expected_signatures - set(by_signature))
    if missing:
        analysis["comparable"] = False
        analysis["reason"] = (
            "Faltan puntos del diseño de identificación: "
            + ", ".join(
                f"α{_format_value(alpha)} β{_format_value(beta)} Q{_format_value(q)}"
                for alpha, beta, _rho, q in missing
            )
            + ". Sin los seis puntos no hay contraste de razón."
        )
        return analysis

    seeds = _shared_seeds(*by_signature.values())
    if len(seeds) < 2:
        analysis["comparable"] = False
        analysis["reason"] = "Los puntos de identificación no comparten al menos 2 semillas."
        return analysis
    analysis["comparable"] = True
    analysis["seeds"] = seeds

    points: list[dict[str, Any]] = []
    for (alpha, beta, rho, q), group in sorted(by_signature.items()):
        values = [group[seed]["distanceKmOptimized"] for seed in seeds]
        points.append(
            {
                "acoAlpha": alpha,
                "acoBeta": beta,
                "acoRho": rho,
                "pheromoneQ": q,
                "ratio": round(beta / alpha, 4),
                "label": f"α{_format_value(alpha)} β{_format_value(beta)} Q{_format_value(q)}",
                "stats": _stats(values),
                "iterationsEffective": _effective_iterations(group, seeds),
            }
        )
    analysis["points"] = points

    comparisons: list[dict[str, Any]] = []
    for contrast in RATIO_CONTRASTS:
        left_sig = (
            contrast["left"][0],
            contrast["left"][1],
            float(_RATIO_PROFILE["acoRho"]),
            contrast["left"][2],
        )
        right_sig = (
            contrast["right"][0],
            contrast["right"][1],
            float(_RATIO_PROFILE["acoRho"]),
            contrast["right"][2],
        )
        left_group = by_signature[left_sig]
        right_group = by_signature[right_sig]
        pair_seeds = _shared_seeds(left_group, right_group)
        left_values = {seed: left_group[seed]["distanceKmOptimized"] for seed in pair_seeds}
        right_values = {seed: right_group[seed]["distanceKmOptimized"] for seed in pair_seeds}
        delta_stats = _paired_delta(left_values, right_values, pair_seeds, delta)
        comparisons.append(
            {
                "code": contrast["code"],
                "kind": contrast["kind"],
                "label": contrast["label"],
                "reading": contrast["reading"],
                "expectation": contrast["expectation"],
                "left": list(contrast["left"]),
                "right": list(contrast["right"]),
                "leftLabel": f"α{_format_value(contrast['left'][0])} β{_format_value(contrast['left'][1])} Q{_format_value(contrast['left'][2])}",
                "rightLabel": f"α{_format_value(contrast['right'][0])} β{_format_value(contrast['right'][1])} Q{_format_value(contrast['right'][2])}",
                "seeds": pair_seeds,
                **delta_stats,
                "satisfied": _contrast_satisfied(
                    contrast["expectation"], delta_stats["withinDelta"], delta_stats["medianKm"], delta
                ),
            }
        )

    adjusted = holm_adjust([row["test"]["pValue"] for row in comparisons])
    for row, p_value in zip(comparisons, adjusted, strict=True):
        row["pValueHolm"] = round(p_value, 5) if p_value is not None else None
    analysis["comparisons"] = comparisons

    within = [row for row in comparisons if row["kind"] == "withinRatio"]
    between = next(row for row in comparisons if row["kind"] == "betweenRatio")
    q_row = next(row for row in comparisons if row["kind"] == "q")
    within_satisfied = [row["satisfied"] for row in within]
    ratio_governs: bool | None
    if any(value is None for value in within_satisfied) or between["satisfied"] is None:
        ratio_governs = None
    else:
        ratio_governs = bool(all(within_satisfied) and between["satisfied"])
    contradicted: bool | None
    if ratio_governs is None:
        contradicted = None
    elif ratio_governs:
        contradicted = False
    else:
        # La hipótesis se **contradice** si algún par con la misma razón difiere más de δ o si
        # dos razones distintas resultan equivalentes; si solo falta muestra, no se contradice.
        contradicted = bool(
            any(row["satisfied"] is False for row in within) or between["satisfied"] is False
        )
    analysis["verdict"] = {
        "ratioGoverns": ratio_governs,
        "contradicted": contradicted,
        "qInert": q_row["satisfied"],
        "qExpectation": "equivalente",
        "rule": (
            "la razón gobierna el orden si los pares de misma razón son equivalentes (IC ⊆ ±δ) y "
            "el par de razón distinta difiere más de δ"
        ),
        "statement": (
            "— sin muestra suficiente para concluir"
            if ratio_governs is None
            else "la razón β/α gobierna el orden: sí"
            if ratio_governs
            else "la razón β/α gobierna el orden: NO"
        ),
    }
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: la identificación es de esta instancia.",
        (
            "Los puntos con β = 2.5 y β = 10 están fuera del rango medido en C3 (β ∈ {1, 5}): "
            "extrapolan, y por eso se declaran como borde del diseño."
        ),
        (
            "La equivalencia se declara con el IC dentro de ±δ; un IC ancho puede no alcanzarla "
            "aunque la mediana sea pequeña (no es evidencia de diferencia material)."
        ),
    ]
    return analysis


# --------------------------------------------------------------------------- #
# C6 — Síntesis de la recomendación (factor a factor)
# --------------------------------------------------------------------------- #

# Perfil estándar de referencia, del que parte toda recomendación.
STANDARD_PATIENCE = 5
STANDARD_PROFILE: dict[str, Any] = {
    "acoAlpha": _STANDARD_KNOBS["acoAlpha"],
    "acoBeta": _STANDARD_KNOBS["acoBeta"],
    "acoRho": _STANDARD_KNOBS["acoRho"],
    "pheromoneQ": _STANDARD_KNOBS["pheromoneQ"],
    "acoPatience": STANDARD_PATIENCE,
    "acoAnts": int(_PROFILE["acoAnts"]),
    "acoIterations": int(_PROFILE["acoIterations"]),
}

# Alternativa de presupuesto más barata dentro de la región equivalente de C3.2 (regla de
# empate: menos hormigas). No entra en el perfil validado porque su equivalencia se midió sin
# corte y el perfil usa paciencia 5; se declara como opción de coste.
BUDGET_ALTERNATIVE: dict[str, int] = {"acoAnts": 8, "acoIterations": 30}

_KNOB_KEYS: tuple[str, ...] = ("acoAlpha", "acoBeta", "acoRho", "acoPatience")


def _factor_levels(factor: str) -> tuple[float, float, float] | None:
    for key, low, high, center in FACTORS:
        if key == factor:
            return low, high, center
    return None


def _is_corner(row: dict[str, Any]) -> bool:
    return bool(row.get("levels")) and all(level is not None for level in row["levels"])


def _simple_effect(
    configs: list[dict[str, Any]], factor: str, fixed: dict[str, float]
) -> float | None:
    """Efecto de ``factor`` **dentro** de un nivel fijo de otro factor.

    En un factorial completo, el efecto de un factor promediado sobre los demás es el efecto
    principal; condicionado a un nivel de otro factor es el efecto simple, que es lo que dice si
    la perilla sigue importando en el contexto que se va a usar.
    """
    levels = _factor_levels(factor)
    if levels is None:
        return None
    low, high, _center = levels
    highs: list[float] = []
    lows: list[float] = []
    for row in configs:
        if not _is_corner(row):
            continue
        params = row.get("params") or {}
        if any(
            abs(float(params.get(key, math.nan)) - value) > 1e-9 for key, value in fixed.items()
        ):
            continue
        median = (row.get("stats") or {}).get("median")
        value = params.get(factor)
        if median is None or value is None:
            continue
        if abs(value - high) <= 1e-9:
            highs.append(float(median))
        elif abs(value - low) <= 1e-9:
            lows.append(float(median))
    if not highs or not lows:
        return None
    return round(float(np.mean(highs)) - float(np.mean(lows)), 2)


def _best_corner_by_ratio(configs: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Esquina de menor mediana, con su razón `r = β/α` (para la rama de razón de C4)."""
    best: dict[str, Any] | None = None
    for row in configs:
        if not _is_corner(row):
            continue
        params = row.get("params") or {}
        alpha = params.get("acoAlpha")
        beta = params.get("acoBeta")
        median = (row.get("stats") or {}).get("median")
        if not alpha or beta is None or median is None:
            continue
        ratio = round(float(beta) / float(alpha), 4)
        candidate = {"label": row.get("label"), "ratio": ratio, "medianKm": median}
        if best is None or candidate["medianKm"] < best["medianKm"]:
            best = candidate
    return best


def _material_interactions(
    contrasts: dict[str, dict[str, Any]], delta: float
) -> dict[str, dict[str, Any]]:
    """Interacciones de dos factores materiales y significativas, indexadas por factor."""
    found: dict[str, dict[str, Any]] = {}
    for factor in _KNOB_KEYS:
        for other in _KNOB_KEYS:
            if other == factor:
                continue
            # El código del contraste es direccional (se genera con left < right), así que se
            # busca en los dos órdenes.
            contrast = contrasts.get(f"{factor}x{other}") or contrasts.get(f"{other}x{factor}")
            if contrast is None or not contrast.get("significant"):
                continue
            if contrast.get("medianKm") is None or abs(contrast["medianKm"]) <= delta:
                continue
            found[factor] = {
                "partner": other,
                "code": contrast["code"],
                "medianKm": contrast["medianKm"],
                "ci": contrast.get("ci"),
            }
    return found


def _best_main_level(factor: str, effect: float | None, standard: float) -> float:
    """Nivel al que apunta el efecto principal (sin efecto, se queda en el estándar)."""
    levels = _factor_levels(factor)
    if levels is None or effect is None or effect == 0:
        return standard
    low, high, _center = levels
    return high if effect < 0 else low


def _recommend_patience(
    contrasts: dict[str, dict[str, Any]],
    configs: list[dict[str, Any]],
    delta: float,
) -> dict[str, Any]:
    contrast = contrasts.get("acoPatience")
    effect = contrast.get("medianKm") if contrast else None
    move = abs(effect) / 2 if effect is not None else None
    significant = bool(contrast and contrast.get("significant"))
    material = bool(move is not None and move > delta)
    standard_waves = max(
        (
            float((row.get("iterations") or {}).get("median") or 0.0)
            for row in configs
            if not _is_corner(row)
        ),
        default=None,
    )
    target = _best_main_level("acoPatience", effect, STANDARD_PATIENCE) if material and significant else STANDARD_PATIENCE
    level_waves = [
        float((row.get("iterations") or {}).get("median") or 0.0)
        for row in configs
        if _is_corner(row)
        and abs(float((row.get("params") or {}).get("acoPatience", math.nan)) - target) <= 1e-9
    ]
    if target == STANDARD_PATIENCE and standard_waves is not None:
        # El estándar es el centro del factorial: su coste en ondas lo miden los centros.
        target_waves = standard_waves
    else:
        target_waves = round(float(np.median(level_waves)), 1) if level_waves else None
    return {
        "value": target,
        "moved": target != STANDARD_PATIENCE,
        "effectKm": effect,
        "predictedMoveKm": round(move, 2) if move is not None else None,
        "significant": significant,
        "material": material,
        "standardWaves": standard_waves,
        "targetWaves": target_waves,
        "costWaves": (
            round(target_waves - standard_waves, 1)
            if target_waves is not None and standard_waves is not None
            else None
        ),
        "reason": (
            f"efecto material y significativo (|{effect}|/2 = {round(move, 2)} km > δ = {delta} km): "
            f"se mueve a {target}, con un coste declarado de {round(target_waves - standard_waves, 1) if target_waves is not None and standard_waves is not None else '—'} ondas"
            if material and significant
            else (
                f"efecto no material desde el centro (|{effect}|/2 = {round(move, 2)} km ≤ δ = {delta} km): se queda en {STANDARD_PATIENCE}"
                if move is not None
                else "sin contraste de paciencia: se queda en el estándar"
            )
        ),
    }


def recommend_profile(
    factorial_analysis: dict[str, Any],
    ratio_analysis: dict[str, Any] | None = None,
    *,
    delta_km: float | None = None,
) -> dict[str, Any]:
    """C6/E4 — Perfil recomendado por **evidencia por factor**, no copiando la mejor fila.

    Regla declarada:

    - efecto **material y significativo** desde el centro (|efecto|/2 > δ y Holm) → mover la
      perilla a su mejor nivel;
    - efecto **no material** → quedarse en el estándar;
    - **par acoplado** (interacción material): si el veredicto de C4 dice que la razón gobierna,
      se recomienda `r = β/α`; si no, se decide el factor **robusto** en los dos contextos del
      otro y el segundo se evalúa **condicionalmente** al nivel recomendado — que es lo que
      corrige el error de mover α cuando α solo pesa con β bajo;
    - **regla de parada**: se mueve solo si el efecto desde el centro supera δ, **declarando su
      coste en ondas**.

    El presupuesto se conserva en el estándar (12×20): la equivalencia de C3.2 se midió sin
    corte y el perfil usa paciencia 5, así que la alternativa `(8, 30)` se declara como opción de
    coste, no como perilla movida.
    """
    if not factorial_analysis.get("comparable"):
        return {
            "available": False,
            "reason": "El factorial no es comparable: no hay efectos que sintetizar.",
        }
    delta = delta_km if delta_km is not None else factorial_analysis.get("deltaKm")
    configs = list(factorial_analysis.get("configs") or [])
    contrasts = {
        contrast["code"]: contrast for contrast in (factorial_analysis.get("contrasts") or [])
    }
    ratio_governs = ((ratio_analysis or {}).get("verdict") or {}).get("ratioGoverns")
    delta_value = float(delta) if delta is not None else 0.0

    profile: dict[str, Any] = dict(STANDARD_PROFILE)
    justification: dict[str, Any] = {}
    warnings: list[str] = []
    coupled = _material_interactions(contrasts, delta_value)

    # 0) Si C4 dice que la razón gobierna el par α×β, se recomienda r y no los dos valores
    #    sueltos. Con el veredicto medido (no gobierna) esta rama no se ejecuta; se conserva
    #    porque es la regla declarada y deja el código alineado con el plan.
    resolved: set[str] = set()
    beta_partner = (coupled.get("acoBeta") or {}).get("partner")
    if ratio_governs and beta_partner == "acoAlpha":
        best = _best_corner_by_ratio(configs)
        if best is not None:
            ratio = best["ratio"]
            profile["acoAlpha"] = STANDARD_PROFILE["acoAlpha"]
            profile["acoBeta"] = round(ratio * profile["acoAlpha"], 4)
            for knob in ("acoAlpha", "acoBeta"):
                justification[knob] = {
                    "source": "razón r = β/α recomendada (C4 dice que gobierna)",
                    "ratio": ratio,
                    "value": profile[knob],
                    "moved": profile[knob] != STANDARD_PROFILE[knob],
                    "material": True,
                    "significant": True,
                    "reason": (
                        f"interacción α×β material ({coupled['acoBeta']['medianKm']} km) y C4 mide "
                        f"que la razón gobierna: se recomienda r = β/α = {ratio:g} (mejor esquina "
                        f"{best['label']}), fijando α = {profile['acoAlpha']:g} y β = {profile['acoBeta']:g}"
                    ),
                }
            resolved.update({"acoAlpha", "acoBeta"})
            beta_levels = _factor_levels("acoBeta")
            if beta_levels is not None and (
                profile["acoBeta"] < beta_levels[0] or profile["acoBeta"] > beta_levels[1]
            ):
                warnings.append(
                    f"La razón recomendada implica β = {profile['acoBeta']:g}, fuera del rango "
                    f"medido en el factorial ({beta_levels[0]:g}–{beta_levels[1]:g}): es extrapolación."
                )

    # 1) Pares acoplados: decide primero el factor robusto y después el otro condicionalmente.
    for factor in _KNOB_KEYS:
        if factor in resolved or factor not in coupled:
            continue
        partner = coupled[factor]["partner"]
        if partner in coupled and coupled[partner]["partner"] == factor:
            # Es un par: evaluar robustez de cada miembro en los dos contextos del otro.
            partner_levels = _factor_levels(partner)
            factor_levels = _factor_levels(factor)
            if partner_levels is None or factor_levels is None:
                continue
            partner_low, partner_high, _ = partner_levels
            factor_low, factor_high, _ = factor_levels
            effect = (contrasts.get(factor) or {}).get("medianKm")
            significant = bool((contrasts.get(factor) or {}).get("significant"))
            at_high = _simple_effect(configs, factor, {partner: partner_high})
            at_low = _simple_effect(configs, factor, {partner: partner_low})
            robust = bool(
                at_high is not None
                and at_low is not None
                and abs(at_high) > delta_value
                and abs(at_low) > delta_value
            )
            if robust and significant:
                value = factor_high if (effect or 0.0) < 0 else factor_low
                profile[factor] = value
                justification[factor] = {
                    "source": "efecto simple robusto en los dos contextos del par",
                    "effectKm": effect,
                    "interactionKm": coupled[factor]["medianKm"],
                    "simpleEffectAtPartnerHighKm": at_high,
                    "simpleEffectAtPartnerLowKm": at_low,
                    "significant": significant,
                    "material": True,
                    "moved": value != STANDARD_PROFILE[factor],
                    "value": value,
                    "reason": (
                        f"interacción material con {partner} ({coupled[factor]['medianKm']} km) pero "
                        f"el efecto simple supera δ en los dos contextos "
                        f"({at_high} y {at_low} km): se mueve a {value}"
                    ),
                }
                resolved.add(factor)

    # 2) El resto (incluidos los acoplados no robustos): efecto principal desde el centro.
    for factor in _KNOB_KEYS:
        if factor in resolved:
            continue
        contrast = contrasts.get(factor)
        effect = contrast.get("medianKm") if contrast else None
        significant = bool(contrast and contrast.get("significant"))
        move = abs(effect) / 2 if effect is not None else None
        material = bool(move is not None and move > delta_value)
        partner = (coupled.get(factor) or {}).get("partner")
        if partner is not None:
            partner_level = float(profile[partner])
            conditional = _simple_effect(configs, factor, {partner: partner_level})
            material_conditional = bool(
                conditional is not None and abs(conditional) > delta_value
            )
            if material_conditional and significant:
                levels = _factor_levels(factor)
                assert levels is not None
                low, high, _ = levels
                value = high if conditional < 0 else low
            else:
                value = STANDARD_PROFILE[factor]
            justification[factor] = {
                "source": f"efecto simple condicionado a {partner} = {partner_level:g}",
                "effectKm": effect,
                "simpleEffectKm": conditional,
                "interactionKm": coupled[factor]["medianKm"],
                "significant": significant,
                "material": material_conditional,
                "moved": value != STANDARD_PROFILE[factor],
                "value": value,
                "reason": (
                    f"el efecto principal ({effect} km) está acoplado a {partner}: condicionado a "
                    f"{partner} = {partner_level:g} el efecto es {conditional} km "
                    + (
                        f"(> δ): se mueve a {value}"
                        if material_conditional and significant
                        else f"(≤ δ): se queda en el estándar {STANDARD_PROFILE[factor]:g}"
                    )
                ),
            }
        else:
            value = (
                _best_main_level(factor, effect, STANDARD_PROFILE[factor])
                if material and significant
                else STANDARD_PROFILE[factor]
            )
            justification[factor] = {
                "source": "efecto principal desde el centro",
                "effectKm": effect,
                "predictedMoveKm": round(move, 2) if move is not None else None,
                "significant": significant,
                "material": material,
                "moved": value != STANDARD_PROFILE[factor],
                "value": value,
                "reason": (
                    f"efecto material y significativo (|{effect}|/2 = {round(move, 2)} km > δ = {delta_value} km)"
                    if material and significant
                    else (
                        f"efecto no material (|{effect}|/2 = {round(move, 2)} km ≤ δ = {delta_value} km): se queda en el estándar"
                        if move is not None
                        else "sin contraste: se queda en el estándar"
                    )
                ),
            }
        profile[factor] = value
        resolved.add(factor)

    # 3) Paciencia con su coste en ondas.
    patience = _recommend_patience(contrasts, configs, delta_value)
    profile["acoPatience"] = patience["value"]
    justification["acoPatience"] = patience

    # 4) Q: validación de implementación (C4), no perilla de distancia.
    q_contrast = next(
        (
            row
            for row in ((ratio_analysis or {}).get("comparisons") or [])
            if row.get("code") == "q"
        ),
        None,
    )
    q_value = float(STANDARD_PROFILE["pheromoneQ"])
    if q_contrast is None:
        q_reason = "Q sin medir en C4: se queda en el estándar"
        warnings.append(
            "Q no se pudo validar (falta la evidencia de C4): se conserva el valor estándar."
        )
    elif q_contrast.get("satisfied"):
        q_reason = "Q inerte dentro del ruido (C4): se queda en el estándar y sale del ranking"
    elif (q_contrast.get("medianKm") or 0.0) > delta_value:
        q_value, q_reason = 2.0, "Q no inerte (C4): el nivel alto rinde mejor; se mueve a Q2"
    else:
        q_value, q_reason = 0.5, "Q no inerte (C4): el nivel bajo rinde mejor; se mueve a Q0.5"
    profile["pheromoneQ"] = q_value
    justification["pheromoneQ"] = {
        "source": "validación de implementación (C4)",
        "value": q_value,
        "moved": q_value != STANDARD_PROFILE["pheromoneQ"],
        "material": False,
        "reason": q_reason,
    }

    # 5) Presupuesto: se conserva el estándar; la alternativa barata se declara.
    justification["budget"] = {
        "source": "eje de presupuesto (C3.2)",
        "value": {"acoAnts": profile["acoAnts"], "acoIterations": profile["acoIterations"]},
        "alternative": dict(BUDGET_ALTERNATIVE),
        "moved": False,
        "reason": (
            "trabajo fijo equivalente en los tres repartos, pero la equivalencia se midió sin "
            "corte y el perfil usa paciencia 5: se conserva 12×20 y se declara (8×30) como "
            "opción de coste, no como perilla movida"
        ),
    }

    # 6) Avisos: bordes, extrapolaciones y acoplamientos no resueltos.
    if ratio_governs is None:
        warnings.append(
            "La razón β/α no está medida (falta C4): el par α×β se decide por efectos simples, "
            "que es la lectura conservadora."
        )
    for factor in _KNOB_KEYS:
        entry = justification.get(factor) or {}
        move = entry.get("predictedMoveKm")
        if (
            move is not None
            and entry.get("significant")
            and delta_value * 0.7 < abs(move) <= delta_value
        ):
            warnings.append(
                f"{FACTOR_SYMBOLS[factor]} = {profile[factor]:g} está cerca del umbral "
                f"(|efecto|/2 = {move} km vs δ = {delta_value} km): la equivalencia con el "
                "estándar es frágil."
            )
    if "acoBeta" in coupled and not justification.get("acoBeta", {}).get("moved") and beta_partner is None:
        warnings.append(
            "β participa en una interacción material y no se pudo decidir de forma robusta: "
            "se conserva el estándar."
        )
    for factor in _KNOB_KEYS:
        entry = justification.get(factor) or {}
        if factor in coupled and not entry.get("moved") and entry.get("source", "").startswith("efecto simple condicionado"):
            warnings.append(
                f"{FACTOR_SYMBOLS[factor]} tiene un efecto principal material ({entry.get('effectKm')} km) "
                f"pero acoplado a {coupled[factor]['partner']} ({coupled[factor]['medianKm']} km): en el "
                f"contexto recomendado su efecto es {entry.get('simpleEffectKm')} km (≤ δ) y se conserva "
                "el estándar. No se mueve una perilla cuyo efecto no sobrevive a la interacción."
            )
    extrapolated = _extrapolation_warning(ratio_analysis, delta_value)
    if extrapolated:
        warnings.append(extrapolated)

    return {
        "available": True,
        "phase": "recommend",
        "deltaKm": delta_value,
        "ratioGoverns": ratio_governs,
        "standard": dict(STANDARD_PROFILE),
        "profile": profile,
        "justification": justification,
        "warnings": warnings,
        "rule": (
            "se mueve una perilla solo si su efecto desde el centro supera δ y es significativo; "
            "los pares acoplados se deciden por efecto simple en el contexto recomendado; la "
            "equivalencia se declara con el IC dentro de ±δ y el empate por coste"
        ),
        "limitations": [
            "Una sola instancia y un solo escenario: la recomendación no generaliza entre instancias.",
            "δ no permite detectar efectos por debajo de ~5 km: «no mover» significa «sin evidencia material de mejora».",
        ],
    }


def _extrapolation_warning(
    ratio_analysis: dict[str, Any] | None, delta: float
) -> str | None:
    """Aviso cuando C4 midió un nivel de β fuera del rango del factorial."""
    points = (ratio_analysis or {}).get("points") or []
    if not points:
        return None
    _low, high, _center = _factor_levels("acoBeta") or (1.0, 5.0, 3.0)
    outside = [row for row in points if float(row.get("acoBeta", 0.0)) > high]
    if not outside:
        return None
    best = min(outside, key=lambda row: row["stats"]["median"])
    inside = [
        row
        for row in points
        if float(row.get("acoBeta", 0.0)) <= high and row.get("acoAlpha") == best.get("acoAlpha")
    ]
    if not inside:
        return (
            f"β = {best['acoBeta']:g} se midió fuera del rango del factorial (β ≤ {high:g}): "
            "es extrapolación y no se recomienda."
        )
    reference = min(inside, key=lambda row: row["stats"]["median"])
    gap = round(best["stats"]["median"] - reference["stats"]["median"], 2)
    if abs(gap) > delta:
        return (
            f"β = {best['acoBeta']:g} se midió fuera del rango del factorial (β ≤ {high:g}) y "
            f"mejora {abs(gap)} km (> δ) a β = {reference['acoBeta']:g}: es un borde del diseño "
            "que conviene medir en una fase futura."
        )
    return (
        f"β = {best['acoBeta']:g} se midió fuera del rango del factorial (β ≤ {high:g}) y está "
        f"dentro de δ de β = {reference['acoBeta']:g} (Δ {gap} km): no se recomienda por ser "
        "extrapolación."
    )


# --------------------------------------------------------------------------- #
# C6 — Validación replicada de la combinación
# --------------------------------------------------------------------------- #


def _profile_case(profile: dict[str, Any], *, label: str) -> dict[str, Any]:
    """Caso del runner a partir de un perfil (control o recomendado)."""
    return {
        "acoAlpha": float(profile["acoAlpha"]),
        "acoBeta": float(profile["acoBeta"]),
        "acoRho": float(profile["acoRho"]),
        "pheromoneQ": float(profile.get("pheromoneQ", _STANDARD_KNOBS["pheromoneQ"])),
        "acoPatience": int(profile.get("acoPatience", STANDARD_PATIENCE)),
        "acoAnts": int(profile.get("acoAnts", _PROFILE["acoAnts"])),
        "acoIterations": int(profile.get("acoIterations", _PROFILE["acoIterations"])),
        "axis": "validation",
        "label": label,
    }


def _profile_label(profile: dict[str, Any]) -> str:
    return (
        f"α{_format_value(float(profile['acoAlpha']))} β{_format_value(float(profile['acoBeta']))} "
        f"ρ{_format_value(float(profile['acoRho']))} Q{_format_value(float(profile.get('pheromoneQ', 1.0)))} "
        f"P{int(profile.get('acoPatience', STANDARD_PATIENCE))} · "
        f"{int(profile.get('acoAnts', _PROFILE['acoAnts']))}×{int(profile.get('acoIterations', _PROFILE['acoIterations']))}"
    )


def validation_cases(recommended: dict[str, Any]) -> list[dict[str, Any]]:
    """C6 — Control (perfil estándar) y combinación recomendada, con las mismas semillas.

    Dos puntos y números aleatorios comunes: la comparación es pareada por semilla, que es lo
    que permite detectar (o acotar) el efecto de la combinación sin confundirlo con el ruido.
    """
    control = _profile_case(STANDARD_PROFILE, label=f"control · {_profile_label(STANDARD_PROFILE)}")
    candidate = _profile_case(recommended, label=f"recomendado · {_profile_label(recommended)}")
    return [control, candidate]


def _validation_signature(run: dict[str, Any]) -> tuple[float, ...] | None:
    """Firma completa: en C6 los dos perfiles pueden diferir en cualquier perilla."""
    keys = ("acoAlpha", "acoBeta", "acoRho", "pheromoneQ", "acoPatience", "acoAnts", "acoIterations")
    values: list[float] = []
    for key in keys:
        raw = run.get(key)
        if raw is None:
            return None
        values.append(float(raw))
    return tuple(values)


def _profile_of_signature(signature: tuple[float, ...]) -> dict[str, Any]:
    alpha, beta, rho, q, patience, ants, iterations = signature
    return {
        "acoAlpha": alpha,
        "acoBeta": beta,
        "acoRho": rho,
        "pheromoneQ": q,
        "acoPatience": int(patience),
        "acoAnts": int(ants),
        "acoIterations": int(iterations),
    }


def _matches_standard(signature: tuple[float, ...]) -> bool:
    profile = _profile_of_signature(signature)
    return all(
        abs(float(profile[key]) - float(STANDARD_PROFILE[key])) <= 1e-9
        for key in ("acoAlpha", "acoBeta", "acoRho", "pheromoneQ", "acoPatience")
    )


def analyze_validation(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C6 — Δ pareado del perfil recomendado frente al control, con veredicto.

    El veredicto usa el **mismo δ** del resto del plan:

    - ``equal`` si el IC 95 % del Δ pareado está **contenido en ±δ** (equivalencia por IC,
      corroborada con **TOST** contra ±δ);
    - ``better`` / ``worse`` según el signo de la mediana del Δ;
    - ``not-comparable`` si no hay dos configuraciones con ≥ 2 semillas compartidas.

    Un test no significativo **no** declara equivalencia: la ausencia de evidencia no es
    evidencia de ausencia.
    """
    runs = _valid_runs(payload)
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)
    by_signature = _runs_by_signature(payload, _validation_signature)

    analysis: dict[str, Any] = {
        "phase": "validation",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
    }

    standard_keys = [key for key in by_signature if _matches_standard(key)]
    candidates = [key for key in by_signature if not _matches_standard(key)]
    if len(standard_keys) != 1 or len(candidates) != 1:
        analysis["comparable"] = False
        analysis["reason"] = (
            "Se esperaba exactamente un control (perfil estándar) y una combinación recomendada; "
            f"se encontraron {len(standard_keys)} y {len(candidates)}. Sin ese par no hay veredicto."
        )
        return analysis

    control = by_signature[standard_keys[0]]
    candidate = by_signature[candidates[0]]
    seeds = _shared_seeds(control, candidate)
    if len(seeds) < 2:
        analysis["comparable"] = False
        analysis["reason"] = "Control y recomendado comparten menos de 2 semillas: no hay comparación pareada."
        return analysis
    analysis["comparable"] = True
    analysis["seeds"] = seeds

    control_values = {seed: control[seed]["distanceKmOptimized"] for seed in seeds}
    candidate_values = {seed: candidate[seed]["distanceKmOptimized"] for seed in seeds}
    differences = [candidate_values[seed] - control_values[seed] for seed in seeds]
    interval = bootstrap_ci(differences)
    within = (
        bool(delta is not None and interval and interval[0] > -delta and interval[1] < delta)
        if interval
        else None
    )
    median_delta = round(float(np.median(differences)), 2)
    control_median = float(np.median(list(control_values.values())))
    analysis["control"] = {
        "label": _profile_label(_profile_of_signature(standard_keys[0])),
        "profile": _profile_of_signature(standard_keys[0]),
        "stats": _stats(list(control_values.values())),
        "iterationsEffective": _effective_iterations(control, seeds),
    }
    analysis["recommended"] = {
        "label": _profile_label(_profile_of_signature(candidates[0])),
        "profile": _profile_of_signature(candidates[0]),
        "stats": _stats(list(candidate_values.values())),
        "iterationsEffective": _effective_iterations(candidate, seeds),
    }
    analysis["delta"] = {
        "medianKm": median_delta,
        "meanKm": round(float(np.mean(differences)), 2),
        "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
        "percent": round(median_delta / control_median * 100, 2) if control_median > 0 else None,
        "test": paired_wilcoxon(differences),
        "tost": tost_paired(differences, delta) if delta else None,
        "withinDelta": within,
        "directionEstablished": (
            bool(interval and (interval[0] > 0 or interval[1] < 0)) if interval else None
        ),
    }
    if within is None:
        verdict, reason = "not-comparable", "Sin IC bootstrap no se emite veredicto."
    elif within:
        verdict, reason = (
            "equal",
            (
                f"El IC 95 % del Δ ({analysis['delta']['ci']}) está contenido en ±δ = {delta} km: "
                "el perfil recomendado es equivalente al control. Se sostiene por coste y por no "
                "desviarse del estándar, no por ganancia en distancia."
            ),
        )
    elif interval is not None and interval[1] < -delta:
        verdict, reason = "better", "El IC 95 % del Δ queda entero por debajo de −δ: mejora material."
    elif interval is not None and interval[0] > delta:
        verdict, reason = "worse", "El IC 95 % del Δ queda entero por encima de +δ: empeora materialmente."
    else:
        # El IC ni cabe en ±δ (equivalencia) ni queda entero fuera (materialidad): la mediana
        # puede apuntar en una dirección, pero con este n no se certifica ninguna de las dos.
        verdict, reason = (
            "not-comparable",
            (
                f"El IC 95 % del Δ ({analysis['delta']['ci']}) no está contenido en ±δ = {delta} km "
                f"(no equivalente) ni queda entero fuera de ±δ (no material). La mediana del Δ es "
                f"{median_delta} km ({analysis['delta']['percent']} %): apunta a mejora, pero el IC "
                "cruza el umbral y el cero, así que no se declara ni equivalencia ni mejora material."
            ),
        )
    analysis["verdict"] = verdict
    analysis["verdictReason"] = reason
    analysis["rule"] = (
        "equal si el IC 95 % del Δ pareado está contenido en ±δ (+ TOST); better/worse si el IC "
        "queda entero fuera de ±δ; si no, no se concluye (ni equivalencia ni materialidad). "
        "Nunca por un test no significativo"
    )
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: el veredicto no generaliza entre instancias.",
        (
            "δ = "
            f"{delta} km: no se detectan diferencias por debajo de ese umbral, y un IC ancho puede "
            "no alcanzar la equivalencia aunque la mediana sea pequeña."
        ),
    ]
    return analysis


# --------------------------------------------------------------------------- #
# C7 — Pesos del objetivo: réplica de las candidatas
# --------------------------------------------------------------------------- #

# Bloque de aceptación del barrido de pesos: la jornada que evalúa AC-2 (plan §C8).
OBJECTIVE_BLOCK_HOURS = 8.0
# Tolerancia de AC-1: misma definición que el barrido de pesos (hasta 15 % más de distancia).
OBJECTIVE_AC1_TOLERANCE = 1.15
# Flota mínima de AC-2 y techo de jornada por defecto del bloque de 8 h.
OBJECTIVE_MIN_ACTIVE_VEHICLES = 3
OBJECTIVE_DEFAULT_MAX_ROUTE_HOURS = 8.0


def _objective_signature(run: dict[str, Any]) -> tuple[float, float, float, float] | None:
    """Firma declarada de una corrida de C7: jornada, λ_b, λ_t y flota mínima pedida."""
    duration = run.get("durationHours")
    if duration is None:
        return None
    return (
        float(duration),
        float(run.get("workloadBalanceWeightRequested") or 0.0),
        float(run.get("makespanWeightRequested") or 0.0),
        float(run.get("minActiveVehiclesRequested") or 0.0),
    )


def _objective_label(signature: tuple[float, float, float, float]) -> str:
    """Etiqueta legible de una firma (no se lee la del run: las réplicas llevan la semilla)."""
    duration, weight_balance, weight_makespan, min_active = signature
    parts = [f"{duration:g} h"]
    if weight_balance:
        parts.append(f"equidad {_format_value(weight_balance)}")
    if weight_makespan:
        parts.append(f"makespan {_format_value(weight_makespan)}")
    if min_active:
        parts.append(f"mín. {int(min_active)} vehículos")
    if len(parts) == 1:
        parts.append("w=0")
    return " · ".join(parts)


def _objective_point(run: dict[str, Any]) -> tuple[float, float, float]:
    """Punto de la frontera: (distancia ↓, makespan ↓, vehículos activos ↑)."""
    return (
        float(run["distanceKmOptimized"]),
        float(run["maxRouteHours"]),
        float(run.get("activeVehicles") or 0),
    )


def _non_dominated_indices(points: Sequence[tuple[float, float, float]]) -> list[int]:
    """Índices no dominados en (x ↓, y ↓, z ↑): la frontera de Pareto del conjunto."""
    keep: list[int] = []
    for index, point in enumerate(points):
        dominated = any(
            (other[0] <= point[0] and other[1] <= point[1] and other[2] >= point[2])
            and (other[0] < point[0] or other[1] < point[1] or other[2] > point[2])
            for other_index, other in enumerate(points)
            if other_index != index
        )
        if not dominated:
            keep.append(index)
    return keep


def _block_runs(source: dict[str, Any]) -> list[dict[str, Any]]:
    """Corridas del bloque de 8 h con métrica completa (sin error).

    A diferencia del resto del protocolo, aquí **no** se descartan por ``uncoveredPoints``:
    que el bloque de 8 h deje puntos sin cubrir es justamente el resultado que AC-2 tiene que
    poder declarar.
    """
    runs: list[dict[str, Any]] = []
    for run in source.get("runs") or []:
        if run.get("error"):
            continue
        if float(run.get("durationHours") or 0) != OBJECTIVE_BLOCK_HOURS:
            continue
        if run.get("distanceKmOptimized") is None or run.get("maxRouteHours") is None:
            continue
        runs.append(run)
    return runs


def objective_candidate_cases(
    source: dict[str, Any],
    *,
    limit: int = 4,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    aco_patience: int = 0,
) -> list[dict[str, Any]]:
    """C7 — Filas candidatas del bloque de 8 h, para replicarlas con el presupuesto del protocolo.

    Candidatas = **la referencia (w = 0) + una fila por punto no dominado** del bloque de
    aceptación (distancia ↓, makespan ↓, flota activa ↑). No se replican las 12 filas del
    bloque: las que comparten punto no aportan una solución distinta, y el plan pide replicar
    «solo las candidatas». El presupuesto es el de calibración (12×20) con paciencia 0
    (presupuesto fijo, C2): aquí se miden los **pesos del objetivo**, no la regla de parada.
    """
    runs = _block_runs(source)
    if not runs:
        raise ValueError(
            "El barrido de pesos no tiene filas del bloque de 8 h: no hay candidatas que replicar. "
            "Corre antes: just phase13-sweep"
        )
    points = [_objective_point(run) for run in runs]
    keep = _non_dominated_indices(points)

    baseline_index = next(
        (
            index
            for index, run in enumerate(runs)
            if not run.get("workloadBalanceWeight")
            and not run.get("makespanWeight")
            and not (run.get("minActiveVehiclesRequested") or 0)
        ),
        None,
    )
    selected: list[int] = []
    if baseline_index is not None:
        selected.append(baseline_index)
    seen: set[tuple[float, float, float]] = set()
    for index in keep:
        if points[index] in seen:
            continue
        seen.add(points[index])
        if index not in selected:
            selected.append(index)

    target = float(source.get("maxRouteHoursTarget") or OBJECTIVE_DEFAULT_MAX_ROUTE_HOURS)
    cases: list[dict[str, Any]] = []
    for index in selected[: max(1, limit)]:
        run = runs[index]
        cases.append(
            {
                "label": f"C7 · {run.get('label')}",
                "axis": "objective",
                "acoAnts": int(aco_ants or _PROFILE["acoAnts"]),
                "acoIterations": int(aco_iterations or _PROFILE["acoIterations"]),
                "acoPatience": int(aco_patience),
                "durationHours": int(run.get("durationHours")),
                "workloadBalanceWeight": float(run.get("workloadBalanceWeight") or 0.0),
                "makespanWeight": float(run.get("makespanWeight") or 0.0),
                "minActiveVehicles": run.get("minActiveVehiclesRequested"),
                "maxRouteHoursTarget": target,
            }
        )
    return cases


def _ratio_median_ci(
    candidate: dict[int, float],
    reference: dict[int, float],
    seeds: Sequence[int],
    *,
    level: float = 0.95,
    resamples: int = 2000,
    seed: int = 42,
) -> tuple[float, float] | None:
    """IC bootstrap de la razón de medianas, remuestreando **semillas** (comparación pareada)."""
    if len(seeds) < 2:
        return None
    cand = np.asarray([candidate[value] for value in seeds], dtype=float)
    ref = np.asarray([reference[value] for value in seeds], dtype=float)
    if np.all(ref <= 0):
        return None
    generator = np.random.default_rng(seed)
    draws = generator.integers(0, cand.size, size=(resamples, cand.size))
    ratios = np.median(cand[draws], axis=1) / np.median(ref[draws], axis=1)
    return (
        float(np.quantile(ratios, (1 - level) / 2)),
        float(np.quantile(ratios, 1 - (1 - level) / 2)),
    )


def _hypervolume(
    points: Sequence[tuple[float, float]], reference: tuple[float, float]
) -> float:
    """Área dominada por una frontera de minimización (makespan ↓, distancia ↓).

    Es el «AUC de la frontera» del plan §C7: con más de dos objetivos no hay métrica escalar
    única, así que se mide el área de las soluciones no dominadas frente al **nadir** (peor
    makespan y peor distancia observados). Cuanto menor, mejor frontera.
    """
    index = _non_dominated_indices([(x, y, 0.0) for x, y in points])
    ordered = sorted((points[i] for i in index), key=lambda point: (point[1], point[0]))
    area = 0.0
    previous_x = reference[0]
    for x, y in ordered:
        if x < previous_x:
            area += (previous_x - x) * (reference[1] - y)
            previous_x = x
    return float(area)


def _hypervolume_ci(
    groups: dict[tuple[float, float, float, float], dict[int, dict[str, Any]]],
    reference: tuple[float, float],
    *,
    level: float = 0.95,
    resamples: int = 2000,
    seed: int = 42,
) -> list[float] | None:
    """IC bootstrap del área dominada, remuestreando las **mismas** semillas en todas las filas.

    Cada remuestreo reconstruye la frontera con las medianas de las semillas sorteadas, así que
    el intervalo mide la **estabilidad de la frontera** frente al ruido, no el del valor puntual.
    """
    seeds = _shared_seeds(*groups.values())
    if len(seeds) < 2:
        return None
    generator = np.random.default_rng(seed)
    draws = generator.integers(0, len(seeds), size=(resamples, len(seeds)))
    samples: list[float] = []
    for draw in draws:
        points = []
        for by_seed in groups.values():
            hours = [float(by_seed[seeds[index]]["maxRouteHours"]) for index in draw]
            distance = [float(by_seed[seeds[index]]["distanceKmOptimized"]) for index in draw]
            points.append((float(np.median(hours)), float(np.median(distance))))
        samples.append(_hypervolume(points, reference))
    return [
        round(float(np.quantile(samples, (1 - level) / 2)), 2),
        round(float(np.quantile(samples, 1 - (1 - level) / 2)), 2),
    ]


def analyze_objective(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C7 — Mediana e IC de las candidatas del bloque de 8 h, con AC-1/AC-2 sobre la mediana.

    Lee la réplica (10 semillas) de las filas candidatas que produce
    :func:`objective_candidate_cases` y responde con intervalos, no con un valor puntual:

    - **AC-1** sobre la mediana, con IC bootstrap de la razón frente a la referencia (w = 0);
    - **AC-2** sobre la mediana (sin puntos descubiertos, ≥ 3 vehículos y ≤ 8 h);
    - **frontera de Pareto** de las medianas y su área dominada (hipervolumen) con IC;
    - **Δ pareado** de cada candidata frente a la referencia, con el mismo δ del protocolo.

    No filtra por ``uncoveredPoints``: que el bloque de 8 h deje puntos sin cubrir es parte
    del resultado (AC-2 no se puede sostener y hay que decirlo).
    """
    runs = _block_runs(payload)
    all_runs = [run for run in payload.get("runs") or [] if not run.get("error")]
    baseline_km = _baseline_km(all_runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline_km)

    analysis: dict[str, Any] = {
        "phase": "objective",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "blockHours": OBJECTIVE_BLOCK_HOURS,
        "baselineKm": round(baseline_km, 2) if baseline_km is not None else None,
        "deltaKm": delta,
        "deltaSource": (
            "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz"
        ),
        "ac1Tolerance": OBJECTIVE_AC1_TOLERANCE,
        "minActiveVehicles": OBJECTIVE_MIN_ACTIVE_VEHICLES,
        "runsTotal": len(payload.get("runs") or []),
        "runsBlock": len(runs),
        "comparable": False,
        "reason": None,
        "points": [],
        "frontier": {"labels": [], "hypervolume": None},
        "distanceInert": None,
        "headline": None,
        "rule": (
            "AC-1 y AC-2 se evalúan sobre la **mediana** de cada fila (no sobre un valor puntual) "
            "con IC 95 %; la frontera se mide como área dominada (hipervolumen) frente al nadir. "
            "La columna «Veredicto» es la lectura OFAT del resto de ejes (mediana > δ → «difiere»); "
            "no sustituye al veredicto replicado de C6, que exige el IC entero fuera de ±δ."
        ),
        "limitations": [
            "Una sola instancia y un solo escenario: la frontera no generaliza entre instancias.",
            (
                "Los pesos del objetivo cambian la **jornada y la flota**, no solo la distancia: "
                "una fila puede empeorar < δ en distancia y aun así no ser sustituible si el "
                "makespan o los puntos sin cubrir cambian."
            ),
        ],
    }
    if not runs:
        analysis["reason"] = (
            "La corrida no tiene filas del bloque de 8 h: no hay candidatas que analizar. "
            "Corre la fase con `just calib-objective`."
        )
        return analysis

    # Agrupa por firma declarada y conserva la métrica por semilla (comparación pareada).
    groups: dict[tuple[float, float, float, float], dict[int, dict[str, Any]]] = {}
    for run in runs:
        signature = _objective_signature(run)
        seed = run.get("seed")
        if signature is None or seed is None:
            continue
        groups.setdefault(signature, {})[int(seed)] = run
    if not groups:
        analysis["reason"] = "Las filas del bloque de 8 h no declaran jornada/pesos: no se pueden agrupar."
        return analysis

    baseline_signature = next(
        (
            signature
            for signature in groups
            if signature[1] == 0.0 and signature[2] == 0.0 and signature[3] == 0.0
        ),
        None,
    )
    baseline_group = groups.get(baseline_signature, {}) if baseline_signature is not None else {}
    max_route_hours_target = float(
        payload.get("maxRouteHoursTarget")
        or OBJECTIVE_DEFAULT_MAX_ROUTE_HOURS
    )

    rows: list[dict[str, Any]] = []
    for signature, by_seed in groups.items():
        seeds = sorted(by_seed)
        distances = {seed: float(by_seed[seed]["distanceKmOptimized"]) for seed in seeds}
        hours = {seed: float(by_seed[seed]["maxRouteHours"]) for seed in seeds}
        vehicles = [float(by_seed[seed].get("activeVehicles") or 0) for seed in seeds]
        uncovered = [int(by_seed[seed].get("uncoveredPoints") or 0) for seed in seeds]
        stats = _stats(list(distances.values()))
        interval = bootstrap_ci(list(distances.values()))
        objective_active = bool(signature[1] or signature[2] or signature[3])
        row: dict[str, Any] = {
            "label": _objective_label(signature),
            "signature": {
                "durationHours": int(signature[0]),
                "workloadBalanceWeight": signature[1],
                "makespanWeight": signature[2],
                "minActiveVehiclesRequested": (None if signature[3] == 0 else int(signature[3])),
            },
            "seeds": len(seeds),
            "objectiveActive": objective_active,
            "isBaseline": signature == baseline_signature,
            "stats": stats,
            "medianKm": stats.get("median"),
            "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
            "maxRouteHours": round(float(np.median(list(hours.values()))), 3),
            "activeVehicles": int(np.median(vehicles)) if vehicles else 0,
            "uncoveredPoints": int(np.median(uncovered)) if uncovered else 0,
            "uncoveredMax": max(uncovered) if uncovered else 0,
            "iterationsEffective": _effective_iterations(by_seed, seeds),
        }
        if baseline_signature is not None and objective_active:
            shared = _shared_seeds(by_seed, baseline_group)
            if len(shared) >= 2:
                baseline_distances = {
                    seed: float(baseline_group[seed]["distanceKmOptimized"]) for seed in shared
                }
                candidate_distances = {seed: distances[seed] for seed in shared}
                paired = _paired_delta(candidate_distances, baseline_distances, shared, delta)
                median_km = float(np.median(list(candidate_distances.values())))
                baseline_median = float(np.median(list(baseline_distances.values())))
                ratio = median_km / baseline_median if baseline_median > 0 else None
                ratio_interval = _ratio_median_ci(candidate_distances, baseline_distances, shared)
                row["vsBaseline"] = {
                    **paired,
                    "verdict": _verdict_line(paired["withinDelta"], paired["medianKm"], delta),
                    "ratio": round(ratio, 3) if ratio is not None else None,
                    "ratioCi": (
                        [round(ratio_interval[0], 3), round(ratio_interval[1], 3)]
                        if ratio_interval
                        else None
                    ),
                    "ac1Ok": bool(ratio is not None and ratio <= OBJECTIVE_AC1_TOLERANCE),
                }
        row["ac2Ok"] = bool(
            row["uncoveredPoints"] == 0
            and row["activeVehicles"] >= OBJECTIVE_MIN_ACTIVE_VEHICLES
            and row["maxRouteHours"] <= max_route_hours_target + 1e-9
        )
        rows.append(row)

    rows.sort(key=lambda item: (item["medianKm"] is None, item["medianKm"], item["label"]))
    analysis["points"] = rows
    if baseline_signature is None:
        analysis["reason"] = (
            "El bloque de 8 h no tiene fila de referencia (w = 0): sin referencia no hay AC-1 "
            "ni Δ pareado."
        )
        return analysis
    baseline_row = next((row for row in rows if row["isBaseline"]), None)
    if baseline_row is None or baseline_row["seeds"] < 2:
        analysis["reason"] = (
            "La referencia (w = 0) no tiene al menos 2 semillas: no hay comparación pareada."
        )
        return analysis

    analysis["comparable"] = True
    analysis["baselineLabel"] = baseline_row["label"]
    analysis["seeds"] = _shared_seeds(*groups.values())
    active_rows = [row for row in rows if row["objectiveActive"]]

    checks = [
        {
            "label": row["label"],
            "medianKm": row["medianKm"],
            "ratio": (row.get("vsBaseline") or {}).get("ratio"),
            "ratioCi": (row.get("vsBaseline") or {}).get("ratioCi"),
            "limitKm": round(
                OBJECTIVE_AC1_TOLERANCE * float(baseline_row["medianKm"] or 0.0), 2
            ),
            "ok": bool((row.get("vsBaseline") or {}).get("ac1Ok")),
        }
        for row in active_rows
    ]
    analysis["ac1"] = {
        "criterion": (
            f"distancia mediana ≤ {OBJECTIVE_AC1_TOLERANCE:g} × mediana de la referencia (w = 0)"
        ),
        "baselineLabel": baseline_row["label"],
        "baselineMedianKm": baseline_row["medianKm"],
        "checks": checks,
        "ok": bool(checks) and all(check["ok"] for check in checks),
    }

    ac2_candidates = [row["label"] for row in rows if row["ac2Ok"]]
    analysis["ac2"] = {
        "criterion": (
            f"mediana con 0 puntos sin cubrir, ≥ {OBJECTIVE_MIN_ACTIVE_VEHICLES} vehículos activos "
            f"y ≤ {max_route_hours_target:g} h"
        ),
        "maxRouteHoursTarget": max_route_hours_target,
        "candidates": ac2_candidates,
        "ok": bool(ac2_candidates),
    }

    median_rows = [row for row in rows if row["medianKm"] is not None]
    median_points = [(row["maxRouteHours"], float(row["medianKm"])) for row in median_rows]
    frontier_index = _non_dominated_indices([(x, y, 0.0) for x, y in median_points])
    reference = (
        max(x for x, _y in median_points) + 1.0,
        max(y for _x, y in median_points) + 1.0,
    )
    analysis["frontier"] = {
        "labels": [median_rows[index]["label"] for index in frontier_index],
        "hypervolume": {
            "value": round(_hypervolume(median_points, reference), 2),
            "ci": _hypervolume_ci(groups, reference),
            "reference": [round(reference[0], 3), round(reference[1], 2)],
            "unit": "km·h",
            "metric": "área dominada (distancia × makespan) frente al nadir de las medianas",
        },
    }

    verdicts = [
        (row.get("vsBaseline") or {}).get("verdict")
        for row in active_rows
        if row.get("vsBaseline")
    ]
    analysis["distanceInert"] = bool(verdicts) and all(
        verdict == "equivalente" for verdict in verdicts
    )
    analysis["ac2Reason"] = (
        f"AC-2 se sostiene sobre la mediana ({len(ac2_candidates)} fila(s))."
        if analysis["ac2"]["ok"]
        else (
            "AC-2 no se sostiene: ninguna fila del bloque de 8 h deja 0 puntos sin cubrir "
            f"(hasta {max(row['uncoveredPoints'] for row in rows)} sin cubrir), así que no hay "
            "punto de operación aceptado."
        )
    )
    analysis["headline"] = " ".join(
        [
            analysis["ac2Reason"],
            (
                "AC-1 se cumple sobre la mediana en todas las candidatas."
                if analysis["ac1"]["ok"]
                else "AC-1 no se cumple sobre la mediana en todas las candidatas."
            ),
            (
                "Los pesos del objetivo no compran distancia más allá de δ: todas las candidatas "
                "activas son equivalentes a la referencia."
                if analysis["distanceInert"]
                else "Al menos una candidata mueve la distancia más de δ frente a la referencia."
            ),
        ]
    )
    return analysis


# --------------------------------------------------------------------------- #
# C5 — Superficie de respuesta local (Box-Behnken)
# --------------------------------------------------------------------------- #

# Factores del Box-Behnken. El primer eje es **β** y no `r = β/α` porque C4 refutó que la
# razón gobierne el orden (plan §C5): α se fija en el valor recomendado por E4.
RSM_FACTORS: tuple[str, ...] = ("acoBeta", "acoRho", "acoIterations")
RSM_CENTER_REPLICATES = 3
RSM_TERMS: tuple[str, ...] = (
    "1",
    "beta",
    "rho",
    "iterations",
    "beta2",
    "rho2",
    "iterations2",
    "beta\u00d7rho",
    "beta\u00d7I",
    "rho\u00d7I",
)

RSM_TERM_LABELS: dict[str, str] = {
    "1": "constante",
    "beta": "β",
    "rho": "ρ",
    "iterations": "I",
    "beta2": "β²",
    "rho2": "ρ²",
    "iterations2": "I²",
    "beta\u00d7rho": "β×ρ",
    "beta\u00d7I": "β×I",
    "rho\u00d7I": "ρ×I",
}


def rsm_design() -> list[tuple[int, int, int]]:
    """Box-Behnken de 3 factores: 12 puntos de arista (pares de factores a ±1) + 3 centros."""
    points: list[tuple[int, int, int]] = []
    for left, right in ((0, 1), (0, 2), (1, 2)):
        for sign_left in (-1, 1):
            for sign_right in (-1, 1):
                coded = [0, 0, 0]
                coded[left] = sign_left
                coded[right] = sign_right
                points.append((coded[0], coded[1], coded[2]))
    points.extend([(0, 0, 0)] * RSM_CENTER_REPLICATES)
    return points


def rsm_levels(recommended: dict[str, Any]) -> dict[str, tuple[float, float, float]]:
    """Niveles (bajo, centro, alto) alrededor del perfil recomendado (paso geométrico ×2)."""
    beta = float(recommended.get("acoBeta", _STANDARD_KNOBS["acoBeta"]))
    rho = float(recommended.get("acoRho", _STANDARD_KNOBS["acoRho"]))
    iterations = int(recommended.get("acoIterations", _PROFILE["acoIterations"]))
    return {
        "acoBeta": (round(beta / 2, 4), beta, round(beta * 2, 4)),
        "acoRho": (round(rho / 2, 4), rho, round(rho * 2, 4)),
        "acoIterations": (round(iterations / 2), iterations, iterations * 2),
    }


def rsm_cases(recommended: dict[str, Any]) -> list[dict[str, Any]]:
    """C5 — 15 puntos Box-Behnken alrededor del perfil recomendado.

    El diseño es **esférico** (sin vértices extremos del cubo): 15 puntos en lugar de los 27 de
    un 3³, con los tres centros replicados para comprobar determinismo y estimar el error local.
    """
    levels = rsm_levels(recommended)
    cases: list[dict[str, Any]] = []
    center_seen = 0
    for coded in rsm_design():
        values: dict[str, float] = {}
        for axis, factor in enumerate(RSM_FACTORS):
            low, center, high = levels[factor]
            level = coded[axis]
            values[factor] = float(low if level < 0 else high if level > 0 else center)
        is_center = all(level == 0 for level in coded)
        if is_center:
            center_seen += 1
            label = f"centro {center_seen} · perfil recomendado"
        else:
            label = "RSM " + " ".join(
                f"{FACTOR_SYMBOLS.get(factor, factor)}{_format_value(values[factor])}"
                for factor in RSM_FACTORS
            )
        cases.append(
            {
                "acoAlpha": float(recommended.get("acoAlpha", _STANDARD_KNOBS["acoAlpha"])),
                "acoBeta": values["acoBeta"],
                "acoRho": values["acoRho"],
                "pheromoneQ": float(recommended.get("pheromoneQ", _STANDARD_KNOBS["pheromoneQ"])),
                "acoPatience": int(recommended.get("acoPatience", STANDARD_PATIENCE)),
                "acoAnts": int(recommended.get("acoAnts", _PROFILE["acoAnts"])),
                "acoIterations": int(values["acoIterations"]),
                "axis": "rsm",
                "label": label,
            }
        )
    return cases


def _rsm_coded_levels(
    by_point: dict[tuple[float, ...], dict[int, dict[str, Any]]]
) -> dict[str, dict[float, int]] | None:
    """Niveles codificados (−1/0/+1) deducidos de los **valores** de cada factor.

    Deducción en lugar de tabla declarada: el análisis no depende de que el diseño codifique
    igual, solo de que cada factor tenga tres valores distintos (bajo, centro, alto).
    """
    coding: dict[str, dict[float, int]] = {}
    for axis, factor in enumerate(RSM_FACTORS):
        values = sorted({key[axis] for key in by_point})
        if len(values) != 3:
            return None
        coding[factor] = {values[0]: -1, values[1]: 0, values[2]: 1}
    return coding


def _rsm_design_matrix(by_point: dict[tuple[float, ...], dict[int, dict[str, Any]]], coding) -> np.ndarray:
    rows = []
    for key in by_point:
        x1 = coding["acoBeta"][key[0]]
        x2 = coding["acoRho"][key[1]]
        x3 = coding["acoIterations"][key[2]]
        rows.append(
            [1.0, x1, x2, x3, x1 * x1, x2 * x2, x3 * x3, x1 * x2, x1 * x3, x2 * x3]
        )
    return np.asarray(rows, dtype=float)


def _rsm_predict(
    coefficients: Sequence[float], x1: float, x2: float, x3: float
) -> float:
    row = [1.0, x1, x2, x3, x1 * x1, x2 * x2, x3 * x3, x1 * x2, x1 * x3, x2 * x3]
    return float(np.dot(np.asarray(coefficients, dtype=float), np.asarray(row, dtype=float)))


def analyze_rsm(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C5 — Coeficientes del modelo de segundo orden y **meseta de equivalencia**.

    Ajuste por mínimos cuadrados (``numpy.linalg.lstsq``) de 10 coeficientes, **una vez por
    semilla**: así cada coeficiente tiene n estimaciones y se le puede dar IC bootstrap y
    contraste. La meseta se lee sobre la mediana de los coeficientes: para cada factor, el
    rango en el que moverse (con los otros en el centro) no degrada más de δ respecto al mejor
    valor predicho de ese eje.
    """
    runs = _valid_runs(payload)
    baseline = _baseline_km(runs)
    delta = delta_km if delta_km is not None else _default_delta(baseline)

    by_point: dict[tuple[float, ...], dict[int, dict[str, Any]]] = {}
    # Los tres centros comparten parámetros y semilla: la clave lleva la **réplica** para no
    # fundirlos en uno (es lo que permite comprobar determinismo y estimar error local).
    occurrences: dict[tuple[float, ...], int] = {}
    for run in runs:
        try:
            params = (
                float(run["acoBeta"]),
                float(run["acoRho"]),
                float(run["acoIterations"]),
            )
        except (KeyError, TypeError, ValueError):
            continue
        seed = run.get("seed")
        if seed is None or run.get("distanceKmOptimized") is None:
            continue
        counter = (*params, float(seed))
        replicate = occurrences.get(counter, 0)
        occurrences[counter] = replicate + 1
        by_point.setdefault((*params, float(replicate)), {})[int(seed)] = run

    analysis: dict[str, Any] = {
        "phase": "rsm",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "baselineKm": round(baseline, 2) if baseline is not None else None,
        "deltaKm": delta,
        "deltaSource": "declarado" if delta_km is not None else f"{DEFAULT_DELTA_PCT:g} % de la referencia voraz",
        "design": "Box-Behnken de 3 factores (β, ρ, I) · 12 aristas + 3 centros",
        "runsValid": len(runs),
        "runsExcluded": len(payload.get("runs") or []) - len(runs),
    }

    expected = 12 + RSM_CENTER_REPLICATES
    if len(by_point) != expected:
        analysis["comparable"] = False
        analysis["reason"] = (
            f"Diseño incompleto: {len(by_point)} puntos de {expected} esperados. "
            "Sin el Box-Behnken completo no hay modelo de segundo orden."
        )
        return analysis
    seeds = _shared_seeds(*by_point.values())
    if len(seeds) < 2:
        analysis["comparable"] = False
        analysis["reason"] = "Los 15 puntos no comparten al menos 2 semillas: no hay ajuste replicado."
        return analysis
    coding = _rsm_coded_levels(by_point)
    if coding is None:
        analysis["comparable"] = False
        analysis["reason"] = "Algún factor no tiene exactamente tres niveles: el diseño no es un Box-Behnken."
        return analysis

    analysis["comparable"] = True
    analysis["seeds"] = seeds
    keys = list(by_point)
    matrix = _rsm_design_matrix(by_point, coding)
    fits: list[np.ndarray] = []
    for seed in seeds:
        response = np.asarray([by_point[key][seed]["distanceKmOptimized"] for key in keys], dtype=float)
        coefficients, *_rest = np.linalg.lstsq(matrix, response, rcond=None)
        fits.append(coefficients)
    fits_array = np.asarray(fits, dtype=float)
    median_coefficients = np.median(fits_array, axis=0)

    terms: list[dict[str, Any]] = []
    for index, term in enumerate(RSM_TERMS):
        column = [float(value) for value in fits_array[:, index]]
        interval = bootstrap_ci(column)
        terms.append(
            {
                "term": term,
                "coefficientKm": round(float(median_coefficients[index]), 4),
                "ci": [round(interval[0], 4), round(interval[1], 4)] if interval else None,
                "test": paired_wilcoxon(column),
            }
        )
    adjusted = holm_adjust(
        [row["test"]["pValue"] for row in terms if row["term"] != "1"]
    )
    for row, p_value in zip([row for row in terms if row["term"] != "1"], adjusted, strict=True):
        row["pValueHolm"] = round(p_value, 5) if p_value is not None else None
        row["significant"] = bool(p_value is not None and p_value < DEFAULT_ALPHA)
    analysis["terms"] = terms
    analysis["family"] = [row["term"] for row in terms if row["term"] != "1"]

    analysis["centers"] = {
        "replicates": RSM_CENTER_REPLICATES,
        "identical": _rsm_centers_identical(by_point, coding),
        "sdKm": _rsm_center_sd(by_point, coding),
    }
    analysis["plateau"] = _rsm_plateau(median_coefficients, coding, delta)
    edge_warnings = [
        (
            f"El mejor valor de {row['symbol']} ({row['bestNatural']:g}) está en el borde del "
            "diseño: el óptimo podría estar fuera del rango medido, así que la meseta es "
            "unilateral y no un mínimo interior confirmado."
        )
        for row in analysis["plateau"].values()
        # Solo si el eje tiene forma apreciable: en un factor inerte el «mejor valor» es
        # arbitrario y el borde no significa nada.
        if row.get("atEdge")
        and delta is not None
        and (abs(row.get("linear") or 0.0) / 2 + abs(row.get("curvature") or 0.0)) > delta
    ]
    analysis["warnings"] = edge_warnings
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: la superficie es local a esta instancia.",
        (
            "La meseta se lee **eje a eje** sobre los coeficientes medianos (los otros factores en "
            "el centro): no es un volumen conjunto, sino el rango por factor donde moverse no "
            "degrada más de δ."
        ),
        "El modelo de segundo orden es una aproximación local: fuera del rango medido no se extrapola.",
    ]
    return analysis


def _beta_rho_medians(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mediana de la distancia por celda (β, ρ), con el número de corridas."""
    cells: dict[tuple[float, float], list[float]] = {}
    for run in runs:
        try:
            key = (float(run["acoBeta"]), float(run["acoRho"]))
            value = float(run["distanceKmOptimized"])
        except (KeyError, TypeError, ValueError):
            continue
        cells.setdefault(key, []).append(value)
    return [
        {
            "beta": beta,
            "rho": rho,
            "medianKm": round(float(np.median(values)), 2),
            "runs": len(values),
        }
        for (beta, rho), values in sorted(cells.items())
    ]


def beta_rho_surface(
    rsm_payload: dict[str, Any], *, delta_km: float | None = None
) -> dict[str, Any] | None:
    """Rejilla β×ρ del modelo RSM (I en el centro) con la región ≤ mejor + δ.

    Función **pura** (numpy): devuelve la superficie para dibujar y las celdas medidas, o
    ``None`` si la evidencia RSM no es un Box-Behnken completo. La figura la pinta el servicio
    de figuras (matplotlib es opcional y no se importa aquí).
    """
    analysis = analyze_rsm(rsm_payload, delta_km=delta_km)
    if not analysis.get("comparable"):
        return None
    runs = _valid_runs(rsm_payload)
    betas = sorted({float(r["acoBeta"]) for r in runs if r.get("acoBeta") is not None})
    rhos = sorted({float(r["acoRho"]) for r in runs if r.get("acoRho") is not None})
    iterations = sorted(
        {float(r["acoIterations"]) for r in runs if r.get("acoIterations") is not None}
    )
    if len(betas) != 3 or len(rhos) != 3 or len(iterations) != 3:
        return None
    beta_low, beta_center, beta_high = betas
    rho_low, rho_center, rho_high = rhos
    iterations_center = iterations[1]
    coefficients = [float(row["coefficientKm"]) for row in analysis["terms"]]
    delta = analysis.get("deltaKm")

    grid_size = 61
    axis_beta = np.linspace(beta_low, beta_high, grid_size)
    axis_rho = np.linspace(rho_low, rho_high, grid_size)
    values = np.empty((grid_size, grid_size), dtype=float)

    def _code(value: float, low: float, center: float, high: float) -> float:
        # Por tramos: low→-1, center→0, high→+1. Los niveles del RSM (paso geométrico ×2) no
        # son equidistantes, así que la mitad del rango no es el centro.
        if value <= center:
            return (value - center) / (center - low) if center > low else 0.0
        return (value - center) / (high - center) if high > center else 0.0

    for row_index, rho in enumerate(axis_rho):
        coded_rho = _code(rho, rho_low, rho_center, rho_high)
        for column_index, beta in enumerate(axis_beta):
            coded_beta = _code(beta, beta_low, beta_center, beta_high)
            values[row_index, column_index] = _rsm_predict(
                coefficients, coded_beta, coded_rho, 0.0
            )

    best = float(np.min(values))
    threshold = best + delta if delta is not None else None
    return {
        "axisBeta": [float(value) for value in axis_beta],
        "axisRho": [float(value) for value in axis_rho],
        "values": [[float(value) for value in row] for row in values],
        "bestKm": best,
        "deltaKm": delta,
        "thresholdKm": threshold,
        "iterationsCenter": iterations_center,
        "betaRange": [beta_low, beta_high],
        "rhoRange": [rho_low, rho_high],
        "samples": _beta_rho_medians(runs),
        "source": "RSM (Box-Behnken)",
    }


def _rsm_center_keys(coding: dict[str, dict[float, int]]) -> list[tuple[float, ...]]:
    """Claves de los puntos centrales (β, ρ, I en el centro), en cualquier réplica."""
    center = {
        factor: next(value for value, level in coding[factor].items() if level == 0)
        for factor in RSM_FACTORS
    }
    return [
        (center["acoBeta"], center["acoRho"], center["acoIterations"], float(replicate))
        for replicate in range(RSM_CENTER_REPLICATES)
    ]


def _rsm_centers_identical(by_point, coding) -> bool | None:
    """Los centros son la misma corrida repetida con las mismas semillas (determinismo)."""
    keys = [key for key in _rsm_center_keys(coding) if key in by_point]
    if len(keys) < 2:
        return None
    reference = {
        seed: run["distanceKmOptimized"] for seed, run in by_point[keys[0]].items()
    }
    for key in keys[1:]:
        other = {seed: run["distanceKmOptimized"] for seed, run in by_point[key].items()}
        if other != reference:
            return False
    return True


def _rsm_center_sd(by_point, coding) -> float | None:
    keys = [key for key in _rsm_center_keys(coding) if key in by_point]
    if not keys:
        return None
    return _pooled_sd(
        [
            [float(run["distanceKmOptimized"]) for run in by_point[key].values()]
            for key in keys
        ]
    )


def _rsm_plateau(
    coefficients: Sequence[float], coding: dict[str, dict[float, int]], delta: float | None
) -> dict[str, Any]:
    """Rango por factor donde moverse no degrada más de δ (los otros en el centro)."""
    natural: dict[str, dict[int, float]] = {
        factor: {level: value for value, level in coding[factor].items()} for factor in RSM_FACTORS
    }
    grid = np.linspace(-1.0, 1.0, 81)
    plateau: dict[str, Any] = {}
    for axis, factor in enumerate(RSM_FACTORS):
        predictions = []
        for point in grid:
            coded = [0.0, 0.0, 0.0]
            coded[axis] = float(point)
            predictions.append(_rsm_predict(coefficients, coded[0], coded[1], coded[2]))
        predictions_array = np.asarray(predictions)
        best_index = int(np.argmin(predictions_array))
        best_value = float(predictions_array[best_index])
        # Rango contiguo alrededor del centro (coded 0) donde la pérdida no supera δ.
        center_index = int(np.argmin(np.abs(grid)))
        if delta is None:
            within = np.ones_like(grid, dtype=bool)
        else:
            within = predictions_array <= best_value + delta
        left = center_index
        while left > 0 and within[left - 1]:
            left -= 1
        right = center_index
        while right < len(grid) - 1 and within[right + 1]:
            right += 1
        coded_left, coded_right = float(grid[left]), float(grid[right])
        plateau[factor] = {
            "symbol": FACTOR_SYMBOLS.get(factor, factor),
            "codedRange": [round(coded_left, 3), round(coded_right, 3)],
            "naturalRange": [
                round(_rsm_interpolate(natural[factor], coded_left), 4),
                round(_rsm_interpolate(natural[factor], coded_right), 4),
            ],
            "bestCoded": round(float(grid[best_index]), 3),
            "bestNatural": round(_rsm_interpolate(natural[factor], float(grid[best_index])), 4),
            "bestPredictedKm": round(best_value, 2),
            "linear": round(float(coefficients[1 + axis]), 4),
            "curvature": round(float(coefficients[4 + axis]), 4),
            "atEdge": bool(abs(float(grid[best_index])) >= 0.99),
        }
    return plateau


def _rsm_interpolate(levels: dict[int, float], coded: float) -> float:
    """Valor natural de un nivel codificado (interpolación lineal −1/0/+1)."""
    low, center, high = levels[-1], levels[0], levels[1]
    if coded <= 0:
        return center + coded * (center - low)
    return center + coded * (high - center)


# --------------------------------------------------------------------------- #
# C8 · Estadístico global (T9)
# --------------------------------------------------------------------------- #


FRIEDMAN_MIN_CONFIGS = 3


def _corner_matrix(
    payload: dict[str, Any],
) -> tuple[list[str], list[str], np.ndarray]:
    """Matriz ``configuración × semilla`` de las **esquinas** del factorial.

    Friedman necesita un diseño de bloques completo: las 16 esquinas con exactamente las mismas
    semillas. Los centros quedan fuera (son el control, no un nivel del diseño).
    """
    by_config: dict[tuple[float, ...], dict[int, float]] = {}
    labels: dict[tuple[float, ...], str] = {}
    for run in _valid_runs(payload):
        params = _config_key(run)
        seed = run.get("seed")
        if params is None or seed is None or run.get("distanceKmOptimized") is None:
            continue
        levels = tuple(
            _coded_level(low, high, center, params[index])
            for index, (_factor, low, high, center) in enumerate(FACTORS)
        )
        if any(level is None for level in levels):
            continue
        by_config.setdefault(params, {})[int(seed)] = float(run["distanceKmOptimized"])
        labels.setdefault(params, _design_label(params, 0) or str(run.get("label") or "corrida"))
    seeds = _shared_seeds(*by_config.values()) if by_config else []
    keys = [key for key in by_config if all(seed in by_config[key] for seed in seeds)]
    keys.sort(key=lambda key: float(np.median([by_config[key][seed] for seed in seeds])))
    matrix = np.asarray([[by_config[key][seed] for seed in seeds] for key in keys], dtype=float)
    return [labels[key] for key in keys], [str(seed) for seed in seeds], matrix


def analyze_global(payload: dict[str, Any], *, delta_km: float | None = None) -> dict[str, Any]:
    """C8/T9 — ¿Hay **alguna** diferencia entre las configuraciones del factorial?

    Un solo test de Friedman sobre las 16 esquinas bloqueadas por semilla (la semilla es el
    bloque: los números aleatorios comunes son lo que hace válido el bloqueo). Si sale
    significativo, el post-hoc **pre-declarado** son los pares «mejor mediana vs cada una de las
    otras», ajustados con Holm: es la familia que responde la pregunta útil («¿qué se distingue
    del mejor medido?») sin inflar 120 comparaciones.

    Es un estadístico **global** sobre rangos: complementa los efectos de C3, no los sustituye.
    """
    labels, seeds, matrix = _corner_matrix(payload)
    analysis: dict[str, Any] = {
        "phase": "global",
        "payloadGeneratedAt": payload.get("generatedAt"),
        "scenarioId": payload.get("scenarioId"),
        "configs": len(labels),
        "seeds": seeds,
        "family": "mejor mediana vs cada una de las otras (Holm)",
    }
    if len(labels) < FRIEDMAN_MIN_CONFIGS or len(seeds) < 2:
        analysis["available"] = False
        analysis["reason"] = (
            f"Se necesitan al menos {FRIEDMAN_MIN_CONFIGS} configuraciones y 2 semillas "
            "compartidas para el test global."
        )
        return analysis

    try:
        statistic, p_value = friedmanchisquare(*[matrix[row] for row in range(matrix.shape[0])])
    except Exception as exc:  # noqa: BLE001
        analysis["available"] = False
        analysis["reason"] = f"Friedman no se pudo calcular: {exc}"
        return analysis

    analysis["available"] = True
    analysis["friedman"] = {
        "statistic": round(float(statistic), 4),
        "pValue": float(p_value),
        "significant": bool(p_value < DEFAULT_ALPHA),
        "df": int(matrix.shape[0] - 1),
        "reading": "si es significativo, al menos una configuración difiere de otra",
    }

    best = 0
    pairwise: list[dict[str, Any]] = []
    for other in range(1, matrix.shape[0]):
        differences = [
            float(matrix[other][column] - matrix[best][column])
            for column in range(matrix.shape[1])
        ]
        interval = bootstrap_ci(differences)
        pairwise.append(
            {
                "left": labels[other],
                "right": labels[best],
                "medianKm": round(float(np.median(differences)), 2),
                "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
                "test": paired_wilcoxon(differences),
            }
        )
    adjusted = holm_adjust([row["test"]["pValue"] for row in pairwise])
    for row, p_value in zip(pairwise, adjusted, strict=True):
        row["pValueHolm"] = round(p_value, 5) if p_value is not None else None
        row["significant"] = bool(p_value is not None and p_value < DEFAULT_ALPHA)
    pairwise.sort(key=lambda row: abs(row["medianKm"]), reverse=True)
    analysis["postHoc"] = pairwise
    analysis["postHocSignificant"] = sum(1 for row in pairwise if row["significant"])
    analysis["best"] = labels[best]
    analysis["limitations"] = [
        "Una sola instancia y un solo escenario: el test global es de esta instancia.",
        (
            "El post-hoc compara contra el mejor medido: es la familia pre-declarada de T9, no "
            "las 120 comparaciones posibles entre esquinas."
        ),
        "Friedman sobre rangos no asume normalidad, pero exige el bloqueo completo por semilla.",
    ]
    return analysis


def _verdict(is_significant: bool, p_value: float | None) -> str:
    """Veredicto de un contraste: sin muestra suficiente no se declara «no significativo»."""
    if p_value is None:
        return "— sin muestra"
    return "sí" if is_significant else "no"


def _rounded(value: float | None) -> float | None:
    return round(value, 3) if value is not None else None


# --------------------------------------------------------------------------- #
# Reporte
# --------------------------------------------------------------------------- #


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return lines


def _fmt(value: Any, suffix: str = "") -> str:
    return "—" if value is None else f"{value}{suffix}"


def format_noise_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tabla de C1 en markdown (la reutiliza el reporte de C8)."""
    stats = analysis.get("stats") or {}
    lines: list[str] = [
        (
            f"### C1 · Ruido base ({stats.get('n', 0)} semillas válidas de "
            f"{analysis.get('runsTotal', 0)} corridas)"
        ),
        "",
    ]
    lines += _table(
        ["Métrica", "Valor"],
        [
            ["Mediana", _fmt(stats.get("median"), " km")],
            ["Media", _fmt(stats.get("mean"), " km")],
            ["DE entre semillas (s)", _fmt(stats.get("sd"), " km")],
            ["CV", _fmt(stats.get("cvPct"), " %")],
            ["Rango", f"{_fmt(stats.get('min'))} – {_fmt(stats.get('max'))} km"],
            ["IQR", _fmt(stats.get("iqr"), " km")],
            ["IC 95 % de la media", f"{stats.get('meanCi')}"],
            ["δ declarado", f"{_fmt(analysis.get('deltaKm'), ' km')} ({analysis.get('deltaSource')})"],
            ["Referencia voraz", _fmt(analysis.get("baselineKm"), " km")],
            ["Iteraciones ejecutadas", f"{analysis.get('iterationsRun')}"],
            ["Corridas con corte", str(analysis.get("stoppedEarly"))],
        ],
    )

    legacy = analysis.get("legacyThreshold")
    if legacy:
        lines += [
            "",
            (
                f"**Contraste con el umbral heredado:** {legacy['rule']} = {legacy['km']} km; la DE "
                f"medida es {legacy['measuredSdKm']} km, es decir **{legacy['sdOverThreshold']}× el "
                "umbral**. Ese umbral clasificaba de «estable» lo que solo era indistinguible."
            ),
        ]

    required = analysis.get("requiredSeeds")
    if required:
        lines += [
            "",
            (
                f"**Semillas necesarias** para que el IC de una diferencia quepa en ±δ: "
                f"{required['pairedVsDelta']} (pareado, cota pesimista √2·s) y "
                f"{required['unpairedVsDelta']} (sin emparejar). Se usaron {required['current']}."
            ),
        ]

    convergence = analysis.get("convergence") or {}
    if convergence.get("seriesAvailable"):
        lines += [
            "",
            (
                f"**Convergencia:** la mediana de las corridas alcanza el "
                f"{int(convergence['tolerance'] * 100)} % de su valor final en la iteración "
                f"{convergence['medianIterationToFinal']:g} (peor caso: "
                f"{convergence['maxIterationToFinal']})."
            ),
        ]

    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_factorial_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tablas de C3 en markdown (las reutiliza el reporte de C8)."""
    lines: list[str] = ["### C3 · Factorial 2⁴ + centros", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        (
            f"Esquinas: {analysis['corners']} · centros: {analysis['centers']} · semillas: "
            f"{len(analysis.get('seeds') or [])} · δ = {_fmt(analysis.get('deltaKm'), ' km')}"
        ),
        "",
        "#### Configuraciones (ordenadas por mediana)",
        "",
    ]
    lines += _table(
        [
            "Configuración",
            "Mediana km",
            "IQR",
            "DE",
            "Iter. (mediana)",
            "Δ vs centro",
            "IC 95 % Δ",
            "¿equivalente?",
        ],
        [
            [
                row["label"],
                _fmt(row["stats"]["median"]),
                _fmt(row["stats"]["iqr"]),
                _fmt(row["stats"]["sd"]),
                _fmt((row.get("iterations") or {}).get("median")),
                _fmt((row.get("deltaVsCenter") or {}).get("medianKm")),
                f"{(row.get('deltaVsCenter') or {}).get('ci')}",
                {True: "sí", False: "no", None: "—"}[
                    (row.get("deltaVsCenter") or {}).get("withinDelta")
                ],
            ]
            for row in analysis["configs"]
        ],
    )

    lines += ["", "#### Efectos (familia de 10 contrastes, Holm)", ""]
    lines += _table(
        ["Contraste", "Tipo", "Efecto km", "IC 95 %", "p Wilcoxon", "p Holm", "¿significativo?"],
        [
            [
                contrast["label"],
                "principal" if contrast["kind"] == "main" else "interacción",
                _fmt(contrast["medianKm"]),
                f"{contrast['ci']}",
                _fmt(contrast["test"]["pValue"]),
                _fmt(contrast["pValueHolm"]),
                _verdict(contrast["significant"], contrast["pValueHolm"]),
            ]
            for contrast in analysis["contrasts"]
        ],
    )

    curvature = analysis.get("curvature") or {}
    noise = analysis.get("noise") or {}
    identical = noise.get("centerReplicatesIdentical")
    lines += [
        "",
        "#### Curvatura y ruido",
        "",
        (
            f"- Curvatura (centros − esquinas): mediana {_fmt(curvature.get('medianKm'), ' km')}, "
            f"IC 95 % {curvature.get('ci')}. {curvature.get('reading')}."
        ),
        (
            f"- DE entre semillas en el centro: {_fmt(noise.get('centerSdAcrossSeeds'), ' km')} · "
            "réplicas del centro "
            + (
                "idénticas (el motor es determinista con parámetros y semilla)"
                if identical
                else "DISTINTAS (revisar determinismo del motor)"
                if identical is False
                else "sin réplicas con que comprobar"
            )
        ),
    ]

    selection = analysis.get("selection") or {}
    if selection.get("available"):
        best = selection["best"]
        cheapest = selection.get("cheapestEquivalent")
        lines += [
            "",
            "#### Selección",
            "",
            f"- Mejor mediana: **{best['label']}** ({best['medianKm']} km).",
            f"- Región equivalente (±δ): **{selection['equivalentCount']}** configuraciones.",
            (
                f"- Más barata dentro de la región equivalente: **{cheapest['label']}** "
                f"({cheapest['medianKm']} km, Δ {cheapest['deltaMedianKm']} km, "
                f"{_fmt(cheapest.get('iterationsMedian'))} ondas)."
                if cheapest
                else "- Sin candidata barata dentro de la región equivalente."
            ),
            f"- Regla: {selection['rule']}.",
        ]

    convergence = analysis.get("convergence") or {}
    if convergence.get("seriesAvailable"):
        lines += [
            "",
            (
                f"**Convergencia:** mediana de iteración al {int(convergence['tolerance'] * 100)} % "
                f"del valor final = {convergence['medianIterationToFinal']:g} "
                f"(peor caso {convergence['maxIterationToFinal']})."
            ),
        ]

    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_global_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tabla de T9 en markdown (la reutiliza el reporte de C8)."""
    lines: list[str] = ["### T9 · Estadístico global (Friedman + post-hoc Holm)", ""]
    if not analysis.get("available"):
        lines.append(f"**No disponible:** {analysis.get('reason')}")
        return lines

    friedman = analysis["friedman"]
    lines += [
        (
            f"Bloques (semillas): {len(analysis.get('seeds') or [])} · "
            f"tratamientos (esquinas): {analysis.get('configs')} · mejor mediana: "
            f"**{analysis.get('best')}**"
        ),
        "",
        (
            f"**Friedman:** χ² = {friedman['statistic']} (gl = {friedman['df']}), "
            f"p = {_fmt(friedman['pValue'])} → "
            f"{'hay diferencias' if friedman['significant'] else 'no se detectan diferencias'} "
            f"({friedman['reading']})."
        ),
        "",
        f"#### Post-hoc ({analysis.get('family')})",
        "",
    ]
    lines += _table(
        ["Configuración", "Δ vs mejor km", "IC 95 % Δ", "p Wilcoxon", "p Holm", "¿significativo?"],
        [
            [
                row["left"],
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                _fmt(row["test"]["pValue"]),
                _fmt(row.get("pValueHolm")),
                {True: "sí", False: "no", None: "— sin muestra"}[row.get("significant")],
            ]
            for row in analysis["postHoc"]
        ],
    )
    lines += [
        "",
        (
            f"Tras Holm, **{analysis.get('postHocSignificant')}** de "
            f"{len(analysis.get('postHoc') or [])} pares se distinguen del mejor medido. El "
            "resto no es «equivalente»: es «sin evidencia de diferencia» (para eso está el IC vs δ)."
        ),
    ]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_recommendation(analysis: dict[str, Any]) -> list[str]:
    """Tabla del perfil recomendado (E4), reutilizada por el reporte de C8."""
    lines: list[str] = ["### Síntesis de la recomendación (E4)", ""]
    if not analysis.get("available"):
        lines.append(f"**No disponible:** {analysis.get('reason')}")
        return lines

    standard = analysis["standard"]
    profile = analysis["profile"]
    governs = analysis.get("ratioGoverns")
    lines += [
        (
            f"δ = {_fmt(analysis.get('deltaKm'), ' km')} · la razón β/α gobierna el orden: "
            + ("sí" if governs else "no" if governs is False else "— sin medir")
        ),
        "",
        "#### Perfil por perilla",
        "",
    ]
    rows: list[list[str]] = []
    for knob in ("acoAlpha", "acoBeta", "acoRho", "acoPatience", "pheromoneQ"):
        entry = analysis["justification"].get(knob) or {}
        rows.append(
            [
                FACTOR_SYMBOLS.get(knob, "Q"),
                _format_value(float(standard[knob])),
                _format_value(float(profile[knob])),
                {True: "sí", False: "no"}[bool(entry.get("moved"))],
                _fmt(entry.get("effectKm")),
                entry.get("reason", "—"),
            ]
        )
    budget = analysis["justification"].get("budget") or {}
    rows.append(
        [
            "presupuesto",
            f"{standard['acoAnts']}×{standard['acoIterations']}",
            f"{profile['acoAnts']}×{profile['acoIterations']}",
            "no",
            "—",
            str(budget.get("reason", "—")),
        ]
    )
    lines += _table(
        ["Perilla", "Estándar", "Recomendado", "¿se mueve?", "Efecto km", "Decisión"], rows
    )
    lines += ["", f"Regla: {analysis.get('rule')}."]
    if analysis.get("warnings"):
        lines += ["", "**Advertencias:**"] + [f"- {item}" for item in analysis["warnings"]]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_validation_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tabla de C6 en markdown (la reutiliza el reporte de C8)."""
    lines: list[str] = ["### C6 · Validación replicada de la combinación", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    delta = analysis.get("delta") or {}
    tost = delta.get("tost") or {}
    lines += [
        (
            f"Semillas: {len(analysis.get('seeds') or [])} · δ = {_fmt(analysis.get('deltaKm'), ' km')} "
            f"· veredicto: **{analysis.get('verdict')}**"
        ),
        "",
        "#### Control vs recomendado",
        "",
    ]
    lines += _table(
        [
            "Perfil",
            "Mediana km",
            "IQR",
            "Iter. ef. (mediana)",
            "Δ mediana km",
            "IC 95 % Δ",
            "p Wilcoxon",
            "p TOST",
            "¿equivalente?",
        ],
        [
            [
                f"control · {analysis['control']['label']}",
                _fmt(analysis["control"]["stats"].get("median")),
                _fmt(analysis["control"]["stats"].get("iqr")),
                _fmt((analysis["control"].get("iterationsEffective") or {}).get("median")),
                "—",
                "—",
                "—",
                "—",
                "—",
            ],
            [
                f"recomendado · {analysis['recommended']['label']}",
                _fmt(analysis["recommended"]["stats"].get("median")),
                _fmt(analysis["recommended"]["stats"].get("iqr")),
                _fmt((analysis["recommended"].get("iterationsEffective") or {}).get("median")),
                _fmt(delta.get("medianKm")),
                f"{delta.get('ci')}",
                _fmt((delta.get("test") or {}).get("pValue")),
                _fmt(tost.get("pValue")),
                {True: "sí", False: "no", None: "—"}[delta.get("withinDelta")],
            ],
        ],
    )
    lines += [
        "",
        "#### Veredicto",
        "",
        f"- **{analysis.get('verdict')}** ({delta.get('percent')} % de cambio mediano) — "
        f"{analysis.get('verdictReason')}",
        f"- TOST contra ±δ: {'equivalente' if tost.get('equivalent') else 'no equivalente'} "
        f"(p = {_fmt(tost.get('pValue'))}).",
        f"- Regla: {analysis.get('rule')}.",
    ]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_objective_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tabla de C7 en markdown (la reutiliza el reporte de C8)."""
    lines: list[str] = ["### C7 · Pesos del objetivo (réplica de las candidatas)", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        (
            f"Semillas: {len(analysis.get('seeds') or [])} · bloque: "
            f"{float(analysis.get('blockHours') or 0):g} h · "
            f"δ = {_fmt(analysis.get('deltaKm'), ' km')} · referencia: {analysis.get('baselineLabel')}"
        ),
        "",
    ]
    table_rows: list[list[str]] = []
    for row in analysis.get("points") or []:
        paired = row.get("vsBaseline") or {}
        is_baseline = bool(row.get("isBaseline"))
        table_rows.append(
            [
                row["label"],
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                _fmt(row.get("maxRouteHours")),
                str(row.get("activeVehicles")),
                str(row.get("uncoveredPoints")),
                "referencia" if is_baseline else _fmt(paired.get("medianKm")),
                "—" if is_baseline else f"{paired.get('ci')}",
                "referencia" if is_baseline else _fmt(paired.get("verdict")),
                {True: "sí", False: "no", None: "—"}[
                    True if is_baseline else paired.get("ac1Ok")
                ],
                "sí" if row.get("ac2Ok") else "no",
            ]
        )
    lines += _table(
        [
            "Fila",
            "KM mediana",
            "IC 95 %",
            "Máx. h",
            "Veh.",
            "Sin cubrir",
            "Δ vs ref (km)",
            "IC 95 % Δ",
            "Veredicto",
            "AC-1",
            "AC-2",
        ],
        table_rows,
    )

    ac1 = analysis.get("ac1") or {}
    ac2 = analysis.get("ac2") or {}
    frontier = analysis.get("frontier") or {}
    hypervolume = frontier.get("hypervolume") or {}
    unit = f" {hypervolume.get('unit')}" if hypervolume.get("unit") else ""
    lines += [
        "",
        "#### Frontera de Pareto (medianas)",
        "",
        f"- Frontera: {', '.join(frontier.get('labels') or []) or '—'}.",
        (
            "- Área dominada (hipervolumen, distancia × makespan): "
            f"{_fmt(hypervolume.get('value'), unit)} · "
            f"IC 95 % {hypervolume.get('ci')} · nadir {hypervolume.get('reference')}."
        ),
        "",
        "#### Criterios de aceptación (sobre la mediana)",
        "",
        f"- **AC-1** ({ac1.get('criterion')}): {'se cumple' if ac1.get('ok') else 'no se cumple'}.",
        (
            f"- **AC-2** ({ac2.get('criterion')}): "
            f"{'se cumple' if ac2.get('ok') else 'no se cumple'} — {analysis.get('ac2Reason')}"
        ),
        (
            "- **δ**: todas las candidatas activas son equivalentes a la referencia dentro de δ."
            if analysis.get("distanceInert")
            else "- **δ**: al menos una candidata mueve la distancia más de δ frente a la referencia."
        ),
        "",
        f"**Lectura:** {analysis.get('headline')}",
    ]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_rsm_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tablas de C5 en markdown (las reutiliza el reporte de C8)."""
    lines: list[str] = ["### C5 · Superficie de respuesta local (Box-Behnken)", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        f"{analysis.get('design')} · semillas: {len(analysis.get('seeds') or [])} "
        f"· δ = {_fmt(analysis.get('deltaKm'), ' km')}",
        "",
        "#### Coeficientes (familia de 9, Holm)",
        "",
    ]
    lines += _table(
        ["Término", "Coeficiente km", "IC 95 %", "p Wilcoxon", "p Holm", "¿significativo?"],
        [
            [
                RSM_TERM_LABELS.get(row["term"], row["term"]),
                _fmt(row.get("coefficientKm")),
                f"{row.get('ci')}",
                _fmt(row["test"]["pValue"]),
                _fmt(row.get("pValueHolm")),
                {True: "sí", False: "no", None: "— sin muestra"}[row.get("significant")],
            ]
            for row in analysis["terms"]
        ],
    )

    lines += ["", "#### Meseta de equivalencia (±δ por factor, los otros en el centro)", ""]
    lines += _table(
        ["Factor", "Rango natural", "Rango codificado", "Mejor valor", "Curvatura"],
        [
            [
                row["symbol"],
                f"[{row['naturalRange'][0]} – {row['naturalRange'][1]}]",
                f"[{row['codedRange'][0]} – {row['codedRange'][1]}]",
                _fmt(row.get("bestNatural")),
                _fmt(row.get("curvature")),
            ]
            for row in analysis["plateau"].values()
        ],
    )
    centers = analysis.get("centers") or {}
    identical = centers.get("identical")
    lines += [
        "",
        (
            "- Centros: "
            + (
                "réplicas idénticas (el motor es determinista con parámetros y semilla)"
                if identical
                else "réplicas DISTINTAS (revisar determinismo del motor)"
                if identical is False
                else "sin réplicas con que comprobar"
            )
            + f" · DE entre semillas en el centro: {_fmt(centers.get('sdKm'), ' km')}"
        ),
    ]
    if analysis.get("warnings"):
        lines += ["", "**Advertencias:**"] + [f"- {item}" for item in analysis["warnings"]]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_budget_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tablas de C3.2 en markdown (las reutiliza el reporte de C8)."""
    lines: list[str] = ["### C3.2 · Eje de presupuesto", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        (
            f"Puntos: {len(analysis.get('points') or [])} · semillas: "
            f"{len(analysis.get('seeds') or [])} · referencia: "
            f"{analysis['reference'][0]}×{analysis['reference'][1]} · δ = "
            f"{_fmt(analysis.get('deltaKm'), ' km')}"
        ),
        "",
        "#### Puntos del eje",
        "",
    ]
    lines += _table(
        [
            "Punto",
            "Trabajo",
            "Iter. efectivas (mediana)",
            "Mediana km",
            "IQR",
            "Δ vs referencia",
            "IC 95 % Δ",
            "¿equivalente?",
            "s ACO",
        ],
        [
            [
                row["label"],
                str(row["workUnits"]),
                _fmt((row.get("iterationsEffective") or {}).get("median")),
                _fmt(row["stats"].get("median")),
                _fmt(row["stats"].get("iqr")),
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                {True: "sí", False: "no", None: "—"}[row.get("withinDelta")],
                _fmt(row.get("acoSecondsMedian")),
            ]
            for row in analysis["points"]
        ],
    )

    lines += ["", "#### Brazo creciente (¿sube el techo a 40?)", ""]
    lines += _table(
        ["Contraste", "Δ (40 − base)", "IC 95 %", "¿mejora > δ?", "Veredicto"],
        [
            [
                row["label"],
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                {True: "sí", False: "no"}[row["improvesBeyondDelta"]],
                row["verdict"],
            ]
            for row in analysis["growingArm"]
        ],
    )

    decision = analysis.get("decision") or {}
    fixed = analysis.get("fixedWork") or {}
    cheapest = fixed.get("cheapestEquivalent")
    lines += [
        "",
        "#### Decisión",
        "",
        f"- **{decision.get('summary')}** — regla: {decision.get('rule')}.",
        (
            f"- Región de trabajo fijo: {fixed.get('equivalentCount')} de "
            f"{len(fixed.get('points') or [])} puntos equivalentes; el más barato es "
            f"**{cheapest['label']}** ({cheapest['ants']} hormigas × {cheapest['iterations']} "
            f"iteraciones)."
            if cheapest
            else "- Sin punto de trabajo fijo equivalente a la referencia."
        ),
        f"- Regla de empate: {fixed.get('rule')}.",
    ]

    if analysis.get("warnings"):
        lines += ["", "**Advertencias:**"] + [f"- {item}" for item in analysis["warnings"]]

    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_no_cut_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tabla de C3.3 en markdown (la reutiliza el reporte de C8)."""
    lines: list[str] = ["### C3.3 · Brazo sin corte", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        (
            f"Configuraciones: {len(analysis.get('comparisons') or [])} · semillas: "
            f"{len(analysis.get('seeds') or [])} · δ = {_fmt(analysis.get('deltaKm'), ' km')}"
        ),
        "",
        "#### Δ pareado (sin corte − con corte)",
        "",
    ]
    lines += _table(
        [
            "Configuración",
            "Sin corte km",
            "Con corte km",
            "Δ km",
            "IC 95 % Δ",
            "Ondas (sin/con corte)",
            "¿mejora > δ?",
            "Veredicto",
        ],
        [
            [
                row["label"],
                _fmt(row["noCutStats"].get("median")),
                _fmt(row["withCutStats"].get("median")),
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                f"{_fmt((row.get('noCutIterations') or {}).get('median'))} / "
                f"{_fmt((row.get('withCutIterations') or {}).get('median'))}",
                {True: "sí", False: "no"}[row["improvesBeyondDelta"]],
                row["verdict"],
            ]
            for row in analysis["comparisons"]
        ],
    )
    lines += ["", f"Regla: {analysis.get('rule')}."]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines


def format_ratio_analysis(analysis: dict[str, Any]) -> list[str]:
    """Tablas de C4 en markdown (las reutiliza el reporte de C8)."""
    lines: list[str] = ["### C4 · Identificación r = β/α y validación de Q", ""]
    if not analysis.get("comparable"):
        lines.append(f"**No comparable:** {analysis.get('reason')}")
        return lines

    lines += [
        (
            f"Puntos: {len(analysis.get('points') or [])} · semillas: "
            f"{len(analysis.get('seeds') or [])} · δ = {_fmt(analysis.get('deltaKm'), ' km')}"
        ),
        "",
        "#### Puntos de identificación",
        "",
    ]
    lines += _table(
        ["Punto", "r = β/α", "Mediana km", "IQR", "Iter. efectivas (mediana)"],
        [
            [
                row["label"],
                _fmt(row["ratio"]),
                _fmt(row["stats"].get("median")),
                _fmt(row["stats"].get("iqr")),
                _fmt((row.get("iterationsEffective") or {}).get("median")),
            ]
            for row in analysis["points"]
        ],
    )

    lines += ["", "#### Contrastes pre-declarados (familia de 4, Holm)", ""]
    lines += _table(
        [
            "Contraste",
            "Δ km",
            "IC 95 % Δ",
            "p Wilcoxon",
            "p Holm",
            "Lo declarado",
            "¿se cumple?",
            "Lectura",
        ],
        [
            [
                row["label"],
                _fmt(row.get("medianKm")),
                f"{row.get('ci')}",
                _fmt(row["test"]["pValue"]),
                _fmt(row.get("pValueHolm")),
                row["expectation"],
                {True: "sí", False: "no", None: "— sin muestra"}[row["satisfied"]],
                row["reading"],
            ]
            for row in analysis["comparisons"]
        ],
    )

    verdict = analysis.get("verdict") or {}
    lines += [
        "",
        "#### Veredicto",
        "",
        f"- **{verdict.get('statement')}** — regla: {verdict.get('rule')}.",
        (
            "- Contradicción positiva de H5: algún par con la misma razón difiere más de δ, o "
            "dos razones distintas resultan equivalentes."
            if verdict.get("contradicted")
            else "- H5 no queda contradicha por estos contrastes."
        ),
        (
            "- **Q inerte dentro del ruido: "
            + ("sí" if verdict.get("qInert") else "no") + "**"
            if verdict.get("qInert") is not None
            else "- Q: sin muestra suficiente para concluir."
        ),
    ]
    if analysis.get("limitations"):
        lines += ["", "**Límites declarados:**"] + [f"- {item}" for item in analysis["limitations"]]
    return lines
