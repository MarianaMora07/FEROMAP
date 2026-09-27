"""Evidencia del protocolo de calibración, ensamblada desde la BD.

El protocolo (C0–C8) ya tenía resueltas sus dos mitades: el **diseño de casos** y el
**análisis** viven en :mod:`app.services.calibration_method_service` como funciones puras sobre
un payload. Lo que faltaba era el ensamblaje: resolver **qué corrida** de cada fase es la
vigente y juntar sus análisis.

Ese ensamblaje lo consumen dos sitios y por eso vive aquí, una sola vez:

- el CLI (``just calib-report``), que además lo escribe como markdown;
- la API (``GET /benchmarks/calibration/method``), que sirve los **datos** a la vista de
  calibración (la vista renderiza tablas, no markdown).

**Qué corrida es la vigente.** No la más reciente: las fases del protocolo se validan primero
con 2 semillas (fontanería) y esas corridas son posteriores a las citables. Se elige la de
**más semillas** y se cita su id, que es lo que permite reproducir cada tabla.

**La BD es la única fuente de verdad** (ADR-011): aquí no se ejecuta nada ni se molesta al
motor, y por eso leer la evidencia para decidir los hiperparámetros **no obliga a optimizar en
el momento**.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.calibration_method_service import (
    analyze_budget,
    analyze_factorial,
    analyze_global,
    analyze_no_cut,
    analyze_noise,
    analyze_objective,
    analyze_ratio,
    analyze_rsm,
    analyze_validation,
    recommend_profile,
)
from app.services.calibration_sweep_store import get_sweep, payloads_of_phase
from app.services.instance_fingerprint import cache_state, current_fingerprint

# Barrido del protocolo metodológico (el mismo que usa el CLI).
METHOD_SWEEP = "method"

# Fases del protocolo, en el orden en que se leen y se reportan.
PHASES: tuple[str, ...] = (
    "noise",
    "factorial",
    "budget",
    "nocut",
    "identify",
    "validate",
    "objective",
    "rsm",
)

# Materialidad declarada del protocolo (plan §3). Es el mismo δ de todo el estudio.
DEFAULT_DELTA_KM = 5.07
PROTOCOL_SUMMARY: dict[str, Any] = {
    "deltaKm": DEFAULT_DELTA_KM,
    "seeds": 10,
    "iterations": 20,
    "standardProfile": "12×20",
    "standardHyperparameters": "α1 β3 ρ0.12 Q1",
    "scenario": "normal",
}


def seed_count(payload: dict[str, Any]) -> int:
    """Semillas de una corrida (raíz del payload, o el resumen del presupuesto)."""
    seeds = payload.get("seeds")
    if isinstance(seeds, list):
        return len(seeds)
    budget = payload.get("budget") or {}
    return int(budget.get("replicates") or 0)


def richest_entry(
    db: Session, *, phase: str, sweep: str = METHOD_SWEEP, limit: int = 100
) -> tuple[int, dict[str, Any]] | None:
    """Corrida **más completa** de una fase (más semillas; empate: la más reciente).

    La lectura «vigente = la más reciente» (que sí vale para los barridos de un solo diseño) no
    sirve aquí: cada fase se valida antes con 2 semillas y esas corridas posteriores valdrían
    menos que la citable. Se ordena por semillas y se devuelve también el id para citarlo.
    """
    entries = payloads_of_phase(db, sweep=sweep, phase=phase, limit=limit)
    if not entries:
        return None
    return max(entries, key=lambda item: (seed_count(item[1]), item[0]))


def resolve_entries(
    db: Session, *, sweep: str = METHOD_SWEEP, reference_run_id: int | None = None
) -> dict[str, tuple[int, dict[str, Any]] | None]:
    """Payloads vigentes de las ocho fases; el factorial admite una corrida declarada.

    ``reference_run_id`` fija el factorial de referencia (decisión de C3.3/C6/C5): es la
    evidencia de la que se derivan el «mejor de C3» y el perfil recomendado.
    """
    entries: dict[str, tuple[int, dict[str, Any]] | None] = {}
    for phase in PHASES:
        if phase == "factorial" and reference_run_id is not None:
            stored = get_sweep(db, str(reference_run_id))
            payload = (stored or {}).get("payload")
            entries[phase] = (reference_run_id, payload) if isinstance(payload, dict) else None
            continue
        entries[phase] = richest_entry(db, phase=phase, sweep=sweep)
    return entries


def assemble_evidence(
    entries: dict[str, tuple[int, dict[str, Any]] | None], *, delta_km: float | None = None
) -> dict[str, Any]:
    """Ensambla las tablas de todas las fases desde sus payloads (función pura).

    Devuelve los **datos** (los análisis tal cual salen de los ``analyze_*``) y la trazabilidad
    de cada tabla. Las fases sin evidencia quedan con ``runId: None`` en vez de omitirse: la
    vista y el capítulo deben poder decir «esto falta» sin que el lector lo adivine.
    """
    factorial_entry = entries.get("factorial")
    if factorial_entry is None:
        raise ValueError("La evidencia necesita el factorial de referencia")
    factorial_id, factorial = factorial_entry
    noise = entries.get("noise")
    budget = entries.get("budget")
    nocut = entries.get("nocut")
    identify = entries.get("identify")
    validate = entries.get("validate")
    objective = entries.get("objective")
    rsm = entries.get("rsm")

    delta = delta_km if delta_km is not None else DEFAULT_DELTA_KM
    factorial_analysis = analyze_factorial(factorial, delta_km=delta_km)
    ratio_analysis = (
        analyze_ratio(identify[1], delta_km=delta_km) if identify is not None else None
    )
    recommendation = recommend_profile(factorial_analysis, ratio_analysis, delta_km=delta_km)

    analyses: dict[str, Any] = {
        "noise": analyze_noise(noise[1], delta_km=delta_km) if noise is not None else None,
        "factorial": factorial_analysis,
        "budget": analyze_budget(budget[1], delta_km=delta_km) if budget is not None else None,
        "nocut": (
            analyze_no_cut(nocut[1], factorial, delta_km=delta_km) if nocut is not None else None
        ),
        "ratio": ratio_analysis,
        "validation": (
            analyze_validation(validate[1], delta_km=delta_km) if validate is not None else None
        ),
        "objective": (
            analyze_objective(objective[1], delta_km=delta) if objective is not None else None
        ),
        "rsm": analyze_rsm(rsm[1], delta_km=delta_km) if rsm is not None else None,
        # T9: estadístico global sobre las esquinas del factorial (rangos, bloqueado por semilla).
        "global": analyze_global(factorial, delta_km=delta_km),
    }

    phases: dict[str, Any] = {}
    for phase in PHASES:
        entry = entries.get(phase)
        if entry is None:
            phases[phase] = {
                "runId": None,
                "seeds": 0,
                "generatedAt": None,
                "scenarioId": None,
                # El sello lo rellena `build_evidence` (necesita la huella vigente de la BD).
                "cacheState": "unknown",
                "stale": False,
            }
            continue
        run_id, payload = entry
        phases[phase] = {
            "runId": run_id,
            "seeds": seed_count(payload),
            "generatedAt": payload.get("generatedAt"),
            "scenarioId": payload.get("scenarioId"),
            "cacheState": "unknown",
            "stale": False,
        }

    return {
        "protocol": {
            **PROTOCOL_SUMMARY,
            "deltaKm": delta,
            "referenceRunId": factorial_id,
        },
        "phases": phases,
        "stalePhases": [],
        "analyses": analyses,
        "recommendation": recommendation,
    }


def build_evidence(
    db: Session, *, reference_run_id: int | None = None, delta_km: float | None = None
) -> dict[str, Any]:
    """Evidencia completa leída de la BD (0 CPU).

    Añade el **sello de instancia** de cada fase frente a la instancia vigente: un número de
    otra instancia no es comparable y la vista tiene que poder avisarlo en vez de mostrarlo
    como si fuera de ahora.
    """
    entries = resolve_entries(db, reference_run_id=reference_run_id)
    evidence = assemble_evidence(entries, delta_km=delta_km)

    fingerprints: dict[str, str] = {}
    for phase, entry in entries.items():
        info = evidence["phases"].get(phase) or {}
        if entry is None:
            info["cacheState"] = "unknown"
            info["stale"] = False
            continue
        _run_id, payload = entry
        scenario = str(payload.get("scenarioId") or PROTOCOL_SUMMARY["scenario"])
        if scenario not in fingerprints:
            fingerprints[scenario] = current_fingerprint(db, scenario_id=scenario)
        state = cache_state(payload, fingerprints[scenario])
        info["cacheState"] = state
        info["stale"] = state == "stale"
    evidence["stalePhases"] = [
        phase for phase, info in evidence["phases"].items() if info.get("stale")
    ]
    return evidence
