"""Barrido de pesos del motor multiobjetivo (Fase 13) — evidencia de tesis.

Reutiliza el patrón del estudio de sensibilidad ACO (Fase 3): corre la instancia
demo con `seed` fijo variando los pesos del objetivo y guarda la tabla, la frontera
de Pareto y la evaluación de los criterios de aceptación AC-1/AC-2 (Fase 13, §8).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.services.calibration_sweep_store import latest_payload, record_sweep
from app.services.optimization_service import run_optimization_engine
from app.services.sweep_progress import (
    SWEEP_OBJECTIVE,
    CancelCheck,
    OnRun,
    SweepCancelled,
)

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO_ID = "normal"
DEFAULT_SEED = 42
# H_objetivo del KPI finishUnderTargetPct y de AC-2 (Fase 13, §8).
DEFAULT_MAX_ROUTE_HOURS_TARGET = 8.0
# Tolerancia de AC-1: se acepta hasta 15 % más de distancia que con pesos 0.
AC1_DISTANCE_TOLERANCE = 1.15

# Escenario de aceptación: jornada de 8 h (AC-2) + barrido de cada peso por separado
# y de la combinación equidad + makespan.
SWEEP_CASES: list[dict[str, Any]] = [
    {"label": "base 8 h (w=0)", "durationHours": 8, "wb": 0.0, "wt": 0.0, "minActive": None},
    {"label": "equidad 0.5", "durationHours": 8, "wb": 0.5, "wt": 0.0, "minActive": None},
    {"label": "equidad 1", "durationHours": 8, "wb": 1.0, "wt": 0.0, "minActive": None},
    {"label": "equidad 2", "durationHours": 8, "wb": 2.0, "wt": 0.0, "minActive": None},
    {"label": "equidad 5", "durationHours": 8, "wb": 5.0, "wt": 0.0, "minActive": None},
    {"label": "makespan 0.5", "durationHours": 8, "wb": 0.0, "wt": 0.5, "minActive": None},
    {"label": "makespan 1", "durationHours": 8, "wb": 0.0, "wt": 1.0, "minActive": None},
    {"label": "makespan 2", "durationHours": 8, "wb": 0.0, "wt": 2.0, "minActive": None},
    {"label": "makespan 5", "durationHours": 8, "wb": 0.0, "wt": 5.0, "minActive": None},
    {"label": "equidad 1 + makespan 2", "durationHours": 8, "wb": 1.0, "wt": 2.0, "minActive": None},
    {"label": "equidad 2 + makespan 2", "durationHours": 8, "wb": 2.0, "wt": 2.0, "minActive": None},
    {"label": "mín. 6 vehículos", "durationHours": 8, "wb": 0.0, "wt": 0.0, "minActive": 6},
    # Referencia de jornada base (12 h) para la frontera distancia vs flota vs duración.
    {"label": "base 12 h (w=0)", "durationHours": None, "wb": 0.0, "wt": 0.0, "minActive": None},
    {"label": "12 h · makespan 2", "durationHours": None, "wb": 0.0, "wt": 2.0, "minActive": None},
    {"label": "12 h · equidad 2", "durationHours": None, "wb": 2.0, "wt": 0.0, "minActive": None},
    {"label": "12 h · méq. 2 + mmk. 2", "durationHours": None, "wb": 2.0, "wt": 2.0, "minActive": None},
    {"label": "12 h · mín. 4 vehículos", "durationHours": None, "wb": 0.0, "wt": 0.0, "minActive": 4},
]

# Jornadas explícitas que cubre el barrido (el resto de casos usa la jornada por defecto
# del motor). Fuente de verdad para validar `durationHours` en la API.
SUPPORTED_SWEEP_SHIFTS: frozenset[int] = frozenset(
    case["durationHours"] for case in SWEEP_CASES if case["durationHours"] is not None
)


def validate_sweep_duration(duration_hours: int | None) -> int | None:
    """Valida la jornada pedida contra las que el barrido ya cubre.

    La jornada del barrido **no es una perilla**: los casos fijan 8 h (serie de AC-2) o la
    jornada por defecto del motor, y de ese valor dependen las líneas base de AC-1/AC-2
    (`evaluate_acceptance_criteria`) y las etiquetas del payload. Aceptarla aquí convierte
    un valor inconsistente en un error explícito en vez de ignorarlo en silencio.
    """
    if duration_hours is None:
        return None
    if duration_hours in SUPPORTED_SWEEP_SHIFTS:
        return duration_hours
    supported = ", ".join(str(value) for value in sorted(SUPPORTED_SWEEP_SHIFTS))
    raise ValueError(
        f"durationHours={duration_hours} no está soportado: el barrido de pesos cubre la "
        f"jornada {supported} h (serie de aceptación AC-2) y la jornada por defecto del "
        "motor (omitir el campo)"
    )


def load_multiobjective_sweep(db: Session) -> dict[str, Any] | None:
    """Payload vigente del barrido de pesos (la corrida más reciente en la BD)."""
    return latest_payload(db, sweep=SWEEP_OBJECTIVE)


def _run_sweep_case(
    db: Session,
    *,
    scenario_id: str,
    case: dict[str, Any],
    seed: int,
) -> dict[str, Any]:
    label = str(case["label"])
    try:
        result = run_optimization_engine(
            db,
            scenario_id,
            estimated_duration_hours=case["durationHours"],
            workload_balance_weight=case["wb"],
            makespan_weight=case["wt"],
            min_active_vehicles=case["minActive"],
            max_route_hours_target=DEFAULT_MAX_ROUTE_HOURS_TARGET,
            seed=seed,
            auto_commit=False,
            auto_dispatch=False,
            reporter=None,
        )
        db.rollback()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("Fallo en el barrido multiobjetivo: %s", label)
        return {
            "label": label,
            "durationHours": case["durationHours"],
            "workloadBalanceWeight": case["wb"],
            "makespanWeight": case["wt"],
            "minActiveVehiclesRequested": case["minActive"],
            "error": str(exc),
        }

    kpis = result["kpis"]
    metrics = kpis.get("engineMetrics") or {}
    current_km = float(kpis["distanceKm"]["current"])
    optimized_km = float(kpis["distanceKm"]["optimized"])
    return {
        "label": label,
        "durationHours": case["durationHours"],
        "workloadBalanceWeight": case["wb"],
        "makespanWeight": case["wt"],
        "minActiveVehiclesRequested": case["minActive"],
        "minActiveVehicles": metrics.get("minActiveVehicles"),
        "distanceKmOptimized": round(optimized_km, 2),
        "distanceKmBaseline": round(current_km, 2),
        "savingPct": round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0,
        "activeVehicles": int(kpis.get("activeVehicles") or 0),
        "fleetUtilizationPct": kpis.get("fleetUtilizationPct"),
        "maxRouteHours": float(kpis.get("maxRouteHours") or 0.0),
        "shiftSlackHours": kpis.get("shiftSlackHours"),
        "finishUnderTargetPct": kpis.get("finishUnderTargetPct"),
        "workloadStdHours": kpis.get("workloadStdHours"),
        "fairnessIndex": kpis.get("fairnessIndex"),
        "vehicleWorkloadHours": kpis.get("vehicleWorkloadHours"),
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
        "computationSeconds": round(float(metrics.get("computationSeconds", 0)), 2),
    }


def _dominates(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """True si ``left`` domina a ``right`` (menos distancia, menos makespan, más flota)."""
    better_or_equal = (
        left["distanceKmOptimized"] <= right["distanceKmOptimized"]
        and left["maxRouteHours"] <= right["maxRouteHours"]
        and left["activeVehicles"] >= right["activeVehicles"]
    )
    strictly_better = (
        left["distanceKmOptimized"] < right["distanceKmOptimized"]
        or left["maxRouteHours"] < right["maxRouteHours"]
        or left["activeVehicles"] > right["activeVehicles"]
    )
    return better_or_equal and strictly_better


def build_pareto_frontier(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Soluciones no dominadas en (distancia ↓, makespan ↓, vehículos activos ↑)."""
    valid = [run for run in runs if "error" not in run and run["uncoveredPoints"] == 0]
    frontier: list[dict[str, Any]] = []
    for candidate in valid:
        if any(_dominates(other, candidate) for other in valid if other is not candidate):
            continue
        frontier.append(candidate)
    return sorted(frontier, key=lambda run: run["distanceKmOptimized"])


def evaluate_acceptance_criteria(
    runs: list[dict[str, Any]],
    *,
    max_route_hours_target: float = DEFAULT_MAX_ROUTE_HOURS_TARGET,
) -> dict[str, Any]:
    """AC-1/AC-2/AC-3 (Fase 13, §8) a partir del barrido."""
    by_label = {run["label"]: run for run in runs if "error" not in run}
    baselines: dict[Any, dict[str, Any]] = {}
    if "base 8 h (w=0)" in by_label:
        baselines[8] = by_label["base 8 h (w=0)"]
    if "base 12 h (w=0)" in by_label:
        baselines[None] = by_label["base 12 h (w=0)"]

    def _baseline_for(run: dict[str, Any]) -> dict[str, Any] | None:
        if run["durationHours"] == 8:
            return baselines.get(8)
        if run["durationHours"] is None:
            return baselines.get(None)
        return None

    ac1_checks: list[dict[str, Any]] = []
    for run in runs:
        if "error" in run:
            continue
        objective_active = (
            run["workloadBalanceWeight"] > 0
            or run["makespanWeight"] > 0
            or (run["minActiveVehiclesRequested"] or 0) > 0
        )
        if not objective_active:
            continue
        baseline = _baseline_for(run)
        if baseline is None:
            continue
        limit = AC1_DISTANCE_TOLERANCE * baseline["distanceKmOptimized"]
        ac1_checks.append(
            {
                "label": run["label"],
                "distanceKmOptimized": run["distanceKmOptimized"],
                "baselineKm": baseline["distanceKmOptimized"],
                "limitKm": round(limit, 2),
                "ratio": round(run["distanceKmOptimized"] / baseline["distanceKmOptimized"], 3),
                "ok": run["distanceKmOptimized"] <= limit + 1e-9,
            }
        )

    ac2_candidates = [
        run
        for run in runs
        if "error" not in run
        and run["durationHours"] == 8
        and run["uncoveredPoints"] == 0
        and run["activeVehicles"] >= 3
        and run["maxRouteHours"] <= max_route_hours_target + 1e-9
    ]
    # Punto de operación aceptado: el de menor distancia que cumple AC-2 (lectura de §8:
    # «se acepta hasta 15 % más de distancia si a cambio se sube a ≥3 camiones y ≤8 h»).
    accepted = min(ac2_candidates, key=lambda run: run["distanceKmOptimized"]) if ac2_candidates else None
    accepted_check = None
    if accepted is not None:
        baseline = _baseline_for(accepted)
        if baseline is not None:
            limit = AC1_DISTANCE_TOLERANCE * baseline["distanceKmOptimized"]
            accepted_check = {
                "label": accepted["label"],
                "distanceKmOptimized": accepted["distanceKmOptimized"],
                "baselineKm": baseline["distanceKmOptimized"],
                "limitKm": round(limit, 2),
                "ratio": round(accepted["distanceKmOptimized"] / baseline["distanceKmOptimized"], 3),
                "ok": accepted["distanceKmOptimized"] <= limit + 1e-9,
            }
    exceptions = [check for check in ac1_checks if not check["ok"]]
    return {
        "ac1": {
            "criterion": "distanceKm.optimized ≤ 1.15 × distanceKm.optimized(w=0)",
            "acceptedPoint": accepted_check,
            "checks": ac1_checks,
            "exceptions": exceptions,
            "ok": bool(accepted_check and accepted_check["ok"]),
        },
        "ac2": {
            "criterion": "activeVehicles ≥ 3 y maxRouteHours ≤ 8 h",
            "candidates": [run["label"] for run in ac2_candidates],
            "ok": bool(ac2_candidates),
        },
        "ac3": {
            "criterion": "distinctVehiclesWeek ≥ 6 de 8",
            "evidence": "test_weekly_rotation_increases_distinct_vehicles (unitario, horizonte sintético)",
            "ok": None,
        },
    }


def run_multiobjective_sweep(
    db: Session,
    *,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    on_run: OnRun | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
) -> dict[str, Any]:
    """Corre el barrido completo (instancia demo, seed fijo) y persiste la evidencia.

    ``on_run``/``cancel_check`` conectan el barrido con el job asíncrono: ``on_run``
    reporta el progreso antes de cada corrida y ``cancel_check`` corta entre corridas.
    Si se cancela, lanza :class:`SweepCancelled` y **no** guarda la corrida.
    """
    started = datetime.now(timezone.utc)
    runs: list[dict[str, Any]] = []
    total = len(SWEEP_CASES)
    for index, case in enumerate(SWEEP_CASES):
        if cancel_check is not None and cancel_check():
            raise SweepCancelled(f"Barrido de pesos cancelado tras {len(runs)}/{total} corridas")
        if on_run is not None:
            on_run(index, total, str(case["label"]))
        logger.info("Barrido multiobjetivo · %s", case["label"])
        runs.append(_run_sweep_case(db, scenario_id=scenario_id, case=case, seed=seed))

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioId": scenario_id,
        "seed": seed,
        "maxRouteHoursTarget": DEFAULT_MAX_ROUTE_HOURS_TARGET,
        "instanceFingerprint": instance_fingerprint,
        "runs": runs,
        "paretoFrontier": build_pareto_frontier(runs),
        "acceptance": evaluate_acceptance_criteria(runs),
    }
    record_sweep(
        db,
        sweep=SWEEP_OBJECTIVE,
        payload=payload,
        instance_fingerprint=instance_fingerprint,
    )
    return payload
