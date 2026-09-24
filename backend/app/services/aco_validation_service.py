"""Validación de la combinación de parámetros ACO (Fase 13 · vista de calibración).

El estudio de sensibilidad es **OFAT**: mide un eje a la vez y deja el resto en el perfil
estándar (12×20 · α1 β3 ρ0.12 Q1). Eso deja abierta la pregunta que la defensa hace
siempre: ¿la **combinación** de los mejores niveles medidos rinde de verdad?

Este servicio la responde con **dos corridas en la misma sesión** (misma instancia y
semilla, back-to-back):

- el **perfil estándar**, como control;
- la **combinación propuesta**, derivada por la vista a partir de la sensibilidad.

El veredicto compara la distancia optimizada (KPI primario, decisión D2) de ambas con los
guardarraíles habituales (puntos no cubiertos y errores). No sustituye a un estudio de
interacción ni a una búsqueda multi-semilla: confirma —o refuta— la recomendación OFAT,
que es exactamente lo que hace falta para que los parámetros no sean arbitrarios.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Mapping

from sqlalchemy.orm import Session

from app.services.calibration_sweep_store import latest_payload, record_sweep
from app.services.optimization_service import run_optimization_engine
from app.services.sweep_progress import (
    SWEEP_VALIDATION,
    CancelCheck,
    OnRun,
    SweepCancelled,
)

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO_ID = "normal"
DEFAULT_SEED = 42

# Campos del perfil ACO que viajan en el payload (mismo orden en la validación y el sello).
PROFILE_FIELDS: tuple[str, ...] = (
    "acoAnts",
    "acoIterations",
    "acoAlpha",
    "acoBeta",
    "acoRho",
    "pheromoneQ",
)

# Perfil estándar 12×20 con los hiperparámetros por defecto del motor.
STANDARD_PARAMS: dict[str, Any] = {
    "acoAnts": 12,
    "acoIterations": 20,
    "acoAlpha": 1.0,
    "acoBeta": 3.0,
    "acoRho": 0.12,
    "pheromoneQ": 1.0,
}

STANDARD_ROLE = "standard"
RECOMMENDED_ROLE = "recommended"

# Debajo de esta diferencia relativa el veredicto es «empate» (misma regla de 0,5 % que
# marca un eje como estable en `calibrationSensitivityUx.ts`).
EQUAL_TOLERANCE_PCT = 0.5


def load_aco_validation(db: Session) -> dict[str, Any] | None:
    """Payload vigente de la validación (la corrida más reciente en la BD)."""
    return latest_payload(db, sweep=SWEEP_VALIDATION)


def normalize_profile(profile: Mapping[str, Any] | None) -> dict[str, Any]:
    """Completa la combinación recibida: los campos ausentes caen al perfil estándar.

    Los conteos se fuerzan a entero y los hiperparámetros a flotante, de modo que el
    payload quede comparable campo a campo con :data:`STANDARD_PARAMS`.
    """
    normalized = dict(STANDARD_PARAMS)
    for field in PROFILE_FIELDS:
        value = (profile or {}).get(field)
        if value is None:
            continue
        normalized[field] = int(value) if field in ("acoAnts", "acoIterations") else float(value)
    return normalized


def same_profile(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    """True si dos perfiles coinciden en todos los campos del perfil ACO."""
    return all(left.get(field) == right.get(field) for field in PROFILE_FIELDS)


def _run_validation_case(
    db: Session,
    *,
    scenario_id: str,
    seed: int,
    label: str,
    role: str,
    params: Mapping[str, Any],
) -> dict[str, Any]:
    profile = normalize_profile(params)
    try:
        result = run_optimization_engine(
            db,
            scenario_id,
            aco_ants=int(profile["acoAnts"]),
            aco_iterations=int(profile["acoIterations"]),
            aco_alpha=float(profile["acoAlpha"]),
            aco_beta=float(profile["acoBeta"]),
            aco_rho=float(profile["acoRho"]),
            pheromone_q=float(profile["pheromoneQ"]),
            seed=seed,
            auto_commit=False,
            auto_dispatch=False,
            persist=False,
            reporter=None,
        )
        db.rollback()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return {"label": label, "role": role, "params": profile, "error": str(exc)}

    kpis = result["kpis"]
    metrics = kpis.get("engineMetrics") or {}
    current_km = kpis["distanceKm"]["current"]
    optimized_km = kpis["distanceKm"]["optimized"]

    return {
        "label": label,
        "role": role,
        "params": profile,
        "computationSeconds": round(float(metrics.get("computationSeconds", 0)), 2),
        "acoSeconds": round(float(metrics.get("acoSeconds", 0)), 2),
        "distanceKmOptimized": round(float(optimized_km), 2),
        "distanceKmBaseline": round(float(current_km), 2),
        "savingPct": round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0,
        "acoIterationsRun": metrics.get("acoIterationsRun", profile["acoIterations"]),
        "acoStoppedEarly": bool(metrics.get("acoStoppedEarly", False)),
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
    }


def build_verdict(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Compara la combinación contra el control (distancia optimizada, D2).

    ``outcome`` ∈ ``better`` · ``equal`` · ``worse`` · ``not-comparable``. No se compara
    si alguna corrida falló o dejó puntos sin cubrir: en esos casos el número no es
    comparable y el veredicto lo declara en vez de inventar una mejora.
    """
    by_role = {run.get("role"): run for run in runs}
    standard = by_role.get(STANDARD_ROLE)
    recommended = by_role.get(RECOMMENDED_ROLE)
    empty = {
        "outcome": "not-comparable",
        "reason": "missing",
        "standardKm": None,
        "recommendedKm": None,
        "deltaKm": None,
        "deltaPct": None,
    }
    if standard is None or recommended is None:
        return empty
    if "error" in standard or "error" in recommended:
        return {**empty, "reason": "error"}
    if (standard.get("uncoveredPoints") or 0) > 0 or (recommended.get("uncoveredPoints") or 0) > 0:
        return {**empty, "reason": "uncovered"}

    standard_km = float(standard["distanceKmOptimized"])
    recommended_km = float(recommended["distanceKmOptimized"])
    delta_km = round(recommended_km - standard_km, 2)
    delta_pct = round(delta_km / standard_km * 100, 2) if standard_km > 0 else None

    if delta_pct is not None and abs(delta_pct) <= EQUAL_TOLERANCE_PCT:
        outcome = "equal"
    elif delta_km < 0:
        outcome = "better"
    else:
        outcome = "worse"

    return {
        "outcome": outcome,
        "reason": None,
        "standardKm": round(standard_km, 2),
        "recommendedKm": round(recommended_km, 2),
        "deltaKm": delta_km,
        "deltaPct": delta_pct,
    }


def run_aco_validation(
    db: Session,
    *,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    profile: Mapping[str, Any] | None = None,
    on_run: OnRun | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
) -> dict[str, Any]:
    """Valida la combinación propuesta contra el perfil estándar (2 corridas).

    ``on_run``/``cancel_check`` funcionan igual que en los barridos: ``on_run`` reporta
    antes de cada corrida y ``cancel_check`` corta entre corridas lanzando
    :class:`SweepCancelled`, en cuyo caso **no** se guarda la corrida.
    """
    started = datetime.now(timezone.utc)
    recommended = normalize_profile(profile)

    cases = [
        {"label": "Perfil estándar 12×20", "role": STANDARD_ROLE, "params": dict(STANDARD_PARAMS)},
        {"label": "Combinación recomendada", "role": RECOMMENDED_ROLE, "params": recommended},
    ]
    total = len(cases)
    runs: list[dict[str, Any]] = []
    for index, case in enumerate(cases):
        if cancel_check is not None and cancel_check():
            raise SweepCancelled(f"Validación ACO cancelada tras {len(runs)}/{total} corridas")
        if on_run is not None:
            on_run(index, total, case["label"])
        logger.info("Validación ACO — %s", case["label"])
        runs.append(
            _run_validation_case(
                db,
                scenario_id=scenario_id,
                seed=seed,
                label=case["label"],
                role=case["role"],
                params=case["params"],
            )
        )

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioId": scenario_id,
        "seed": seed,
        "standardParams": dict(STANDARD_PARAMS),
        "profile": recommended,
        "sameParams": same_profile(recommended, STANDARD_PARAMS),
        "instanceFingerprint": instance_fingerprint,
        "verdict": build_verdict(runs),
        "runs": runs,
    }
    record_sweep(
        db,
        sweep=SWEEP_VALIDATION,
        payload=payload,
        instance_fingerprint=instance_fingerprint,
    )
    return payload
