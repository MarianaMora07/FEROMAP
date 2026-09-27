"""Ejecuta **una fase** del protocolo metodológico como job (Camino B).

Cada fase es un diseño distinto y un coste distinto (de 4 a 200 corridas), así que se lanza por
fase y no entera: un job de horas que encadene las ocho sería un solo punto de fallo y dejaría
la vista sin progreso útil.

La construcción de casos es **la misma** que usa el CLI (`just calib-<fase>`), a propósito: el
salvavidas de reanudación (E0) se indexa por caso declarado, así que un barrido empezado por
consola se puede continuar desde la vista y al revés.

Las fases que derivan su diseño de la evidencia (`nocut`, `validate`, `rsm`, `objective`) la leen
de la BD con la misma regla que el reporte (**la corrida más completa**, no la más reciente) y
fallan con un error explícito si falta la referencia: mejor un 409 que dice qué correr antes que
un job de 30 min con el diseño equivocado.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.services.aco_sensitivity_service import (
    DEFAULT_SCENARIO_ID,
    DEFAULT_SEED,
    STANDARD_CASE,
    calibration_resume_path,
    run_aco_sensitivity,
)
from app.services.calibration_evidence_service import (
    METHOD_SWEEP,
    richest_entry,
)
from app.services.calibration_method_service import (
    PROTOCOL_SEEDS,
    analyze_factorial,
    analyze_ratio,
    best_config_from_factorial,
    budget_cases,
    factorial_cases,
    no_cut_cases,
    objective_candidate_cases,
    ratio_cases,
    recommend_profile,
    rsm_cases,
    validation_cases,
)
from app.services.multiobjective_sweep_service import load_multiobjective_sweep
from app.services.sweep_progress import CancelCheck, OnResult, OnRun

# Fases que se pueden lanzar, con su coste declarado en corridas por juego de 10 semillas.
# Sirve para que la vista avise antes de gastar CPU y para validar la petición.
METHOD_PHASE_RUNS: dict[str, int] = {
    "noise": 10,
    "factorial": 200,
    "budget": 50,
    "nocut": 20,
    "identify": 60,
    "validate": 20,
    "objective": 30,
    "rsm": 150,
}

# Valor especial para lanzar el protocolo entero en un solo job. El orden respeta las
# dependencias: el factorial precede a nocut/validate/rsm y la identificación a validate/rsm,
# porque las tres derivan su diseño de esa evidencia.
ALL_PHASES = "all"
PROTOCOL_EXECUTION_ORDER: tuple[str, ...] = (
    "noise",
    "factorial",
    "budget",
    "nocut",
    "identify",
    "validate",
    "objective",
    "rsm",
)


def is_known_phase(phase: str) -> bool:
    """¿Es una fase lanzable? ``all`` lanza las ocho en orden."""
    return phase == ALL_PHASES or phase in METHOD_PHASE_RUNS


class MethodPhaseError(ValueError):
    """La fase no se puede lanzar: falta evidencia de referencia o no existe."""


def method_phase_runs(phase: str, *, seeds: int = 10) -> int:
    """Corridas que costará la fase (para el aviso de coste de la vista).

    Con ``phase='all'`` suma las ocho: es el aviso que evita que alguien lance el protocolo
    entero creyendo que son unos minutos.
    """
    if phase == ALL_PHASES:
        return sum(
            int(METHOD_PHASE_RUNS[name] * seeds / 10) for name in PROTOCOL_EXECUTION_ORDER
        )
    base = METHOD_PHASE_RUNS.get(phase)
    if base is None:
        return 0
    return int(base * seeds / 10)


def _noise_case() -> dict[str, Any]:
    """Caso de C1 tal como lo construye el CLI: sin corte (``acoPatience = 0``)."""
    return {
        **STANDARD_CASE,
        "acoPatience": 0,
        "label": "perfil estándar (sin corte)",
    }


def _factorial_entry(db: Session) -> tuple[int, dict[str, Any]]:
    entry = richest_entry(db, phase="factorial", sweep=METHOD_SWEEP)
    if entry is None:
        raise MethodPhaseError(
            "No hay evidencia del factorial (C3.1). Corre esa fase antes: de ella derivan "
            "el mejor perfil y las fases que dependen de la combinación."
        )
    return entry


def recommended_profile_for_method(db: Session) -> dict[str, Any]:
    """Perfil recomendado de E4 sintetizado desde la evidencia guardada (0 CPU)."""
    _run_id, factorial = _factorial_entry(db)
    identify = richest_entry(db, phase="identify", sweep=METHOD_SWEEP)
    analysis = analyze_factorial(factorial)
    ratio_analysis = analyze_ratio(identify[1]) if identify is not None else None
    recommendation = recommend_profile(analysis, ratio_analysis)
    if not recommendation.get("available"):
        raise MethodPhaseError(
            f"No hay perfil recomendado: {recommendation.get('reason')}"
        )
    return recommendation


def method_cases(db: Session, phase: str) -> list[dict[str, Any]]:
    """Casos de la fase, con la misma construcción que el CLI."""
    if phase == "noise":
        return [_noise_case()]
    if phase == "factorial":
        return factorial_cases()
    if phase == "budget":
        return budget_cases(patience=0)
    if phase == "identify":
        return ratio_cases()
    if phase == "nocut":
        _run_id, factorial = _factorial_entry(db)
        best = best_config_from_factorial(analyze_factorial(factorial))
        if best is None:
            raise MethodPhaseError(
                "El factorial de referencia no es comparable: no hay «mejor de C3» que heredar."
            )
        return no_cut_cases(best)
    if phase in {"validate", "rsm"}:
        profile = recommended_profile_for_method(db)["profile"]
        return validation_cases(profile) if phase == "validate" else rsm_cases(profile)
    if phase == "objective":
        # C7 replica **filas del barrido de pesos** ya corrido (no un diseño nuevo): sin esa
        # evidencia no hay candidatas y el job falla con un 409 en vez de inventarlas.
        source = load_multiobjective_sweep(db)
        if source is None:
            raise MethodPhaseError(
                "No hay barrido de pesos del objetivo (C7). Corre esa fase antes: just phase13-sweep."
            )
        return objective_candidate_cases(source)
    raise MethodPhaseError(
        f"Fase desconocida: '{phase}'. Válidas: {', '.join(sorted(METHOD_PHASE_RUNS))}."
    )


def _execute_phase(
    db: Session,
    *,
    phase: str,
    cases: list[dict[str, Any]],
    scenario_id: str,
    seed: int,
    seed_list: list[int],
    resume: bool,
    on_run: OnRun | None,
    on_result: OnResult | None,
    cancel_check: CancelCheck | None,
    instance_fingerprint: str | None,
) -> dict[str, Any]:
    """Corre una fase con sus casos ya construidos y la guarda en `calibration_sweeps`."""
    return run_aco_sensitivity(
        db,
        scenario_id=scenario_id,
        seeds=seed_list,
        cases=cases,
        phase=phase,
        sweep=METHOD_SWEEP,
        on_run=on_run,
        on_result=on_result,
        cancel_check=cancel_check,
        instance_fingerprint=instance_fingerprint,
        resume_path=calibration_resume_path(sweep=METHOD_SWEEP, phase=phase),
        resume=resume,
    )


def run_calibration_method(
    db: Session,
    *,
    phase: str,
    on_result: OnResult | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Entrada única del barrido ``method``: una fase, o el protocolo completo con ``all``.

    Mantiene la firma que espera `_sweep_runner` (sin parámetros posicionales raros) y
    despacha al runner que corresponda.
    """
    if phase == ALL_PHASES:
        return run_calibration_protocol(db, on_result=on_result, **kwargs)
    return run_calibration_method_phase(db, phase=phase, on_result=on_result, **kwargs)


def run_calibration_method_phase(
    db: Session,
    *,
    phase: str,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    seeds: Sequence[int] | None = None,
    resume: bool = True,
    on_run: OnRun | None = None,
    on_result: OnResult | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Corre la fase del protocolo y guarda su fila en ``calibration_sweeps``.

    ``resume=True`` (por defecto): si el barrido quedó a medias, continúa desde el salvavidas
    de E0 en vez de repetir las corridas ya hechas. ``seeds`` permite la verificación corta
    (``[42, 101]``) antes de gastar el juego completo.
    """
    cases = method_cases(db, phase)
    return _execute_phase(
        db,
        phase=phase,
        cases=cases,
        scenario_id=scenario_id,
        seed=seed,
        seed_list=[int(value) for value in (seeds or PROTOCOL_SEEDS)],
        resume=resume,
        on_run=on_run,
        on_result=on_result,
        cancel_check=cancel_check,
        instance_fingerprint=instance_fingerprint,
    )


def run_calibration_protocol(
    db: Session,
    *,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    seeds: Sequence[int] | None = None,
    resume: bool = True,
    on_run: OnRun | None = None,
    on_result: OnResult | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Corre **las ocho fases en orden** y devuelve la evidencia ensamblada.

    Un solo job para el protocolo entero (horas con 10 semillas): cada fase sigue guardando su
    fila en `calibration_sweeps` y su salvavidas de E0, así que cancelar o cortar deja hechas
    las fases completas y reanudar continúa por donde iba (el orden respeta las dependencias:
    factorial antes de nocut/validate/objective/rsm, identificación antes de validate/rsm).

    El progreso se reporta **sobre el total del protocolo**, con la fase en el rótulo: sin eso,
    un job de 540 corridas en el que el contador vuelve a empezar en cada fase parece roto.
    """
    seed_list = [int(value) for value in (seeds or PROTOCOL_SEEDS)]
    plan: list[tuple[str, list[dict[str, Any]]]] = []
    for phase in PROTOCOL_EXECUTION_ORDER:
        plan.append((phase, method_cases(db, phase)))
    total = sum(len(cases) * len(seed_list) for _phase, cases in plan)
    executed = 0

    def prefix(phase: str, label: str) -> str:
        return f"{phase} · {label}"

    def wrapped_on_run(phase: str):
        def report(index: int, _total: int, label: str) -> None:
            if on_run is not None:
                on_run(executed + index, total, prefix(phase, label))

        return report

    def wrapped_on_result(phase: str):
        def report(run: dict[str, Any]) -> None:
            if on_result is not None:
                on_result({**run, "label": prefix(phase, str(run.get("label") or "corrida"))})

        return report

    for phase, cases in plan:
        if cancel_check is not None and cancel_check():
            from app.services.sweep_progress import SweepCancelled

            raise SweepCancelled(f"Protocolo cancelado antes de la fase '{phase}'")
        _execute_phase(
            db,
            phase=phase,
            cases=cases,
            scenario_id=scenario_id,
            seed=seed,
            seed_list=seed_list,
            resume=resume,
            on_run=wrapped_on_run(phase),
            on_result=wrapped_on_result(phase),
            cancel_check=cancel_check,
            instance_fingerprint=instance_fingerprint,
        )
        executed += len(cases) * len(seed_list)

    # El resultado del job es la evidencia ya ensamblada: la vista la pinta sin otra vuelta.
    from app.services.calibration_evidence_service import build_evidence

    return build_evidence(db)
