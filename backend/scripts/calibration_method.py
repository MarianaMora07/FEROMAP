"""Protocolo de calibración metodológica del motor ACO (Fases C1–C8).

Plan: ``docs/fase-13/plan-calibracion-metodologica.md``.

Uso::

    just calib-noise              # C1 · ruido base: corre y analiza (δ y n)
    just calib-noise --reuse      # C1 · solo el análisis, desde la evidencia guardada
    just calib-factorial          # C3 · factorial 2⁴ + centros: corre y analiza
    just calib-factorial --reuse  # C3 · solo el análisis de la última corrida guardada
    just calib-factorial --dry-run
    just calib-budget             # C3.2 · eje de presupuesto: corre y analiza
    just calib-budget --dry-run   # C3.2 · plan y coste, sin CPU
    just calib-nocut --reference-run-id 4   # C3.3 · brazo sin corte contra el factorial citable
    just calib-identify           # C4 · razón β/α y validación de Q
    just calib-validate --reference-run-id 4   # C6 · validación de la combinación de E4
    just calib-objective          # C7 · réplica de las candidatas del barrido de pesos
    just calib-rsm --reference-run-id 4        # C5 · Box-Behnken (β, ρ, I) alrededor del perfil
    just calib-report --profile                # C8 · solo la síntesis del perfil recomendado
    just calib-report                          # C8 · documento + figuras (PNG) desde la BD (0 CPU)

Cada fase guarda su evidencia en ``calibration_sweeps`` con el identificador ``method`` y el
campo ``phase`` en la raíz del payload, así que no pisa la evidencia que consume la vista de
calibración (barridos ``sensitivity``/``objective``/``validation``). La BD es la única fuente de
verdad (ADR-011): ``--reuse`` reanaliza lo guardado sin gastar CPU.

``--dry-run`` imprime el plan y su coste estimado sin ejecutar ninguna corrida.
``--resume`` reanuda un barrido cortado desde el salvavidas ``data/cache/phase13/`` (E0):
reutiliza las corridas ya terminadas y solo ejecuta las que faltan. La fila de
``calibration_sweeps`` se escribe al final, como siempre (ADR-011); el salvavidas se borra
al guardar.
``--seeds`` fija el conjunto de semillas (números aleatorios comunes: las mismas para todos los
casos, que es lo que hace pareadas las comparaciones).
``--patience`` fija la regla de parada en las fases cuyo diseño no la define (C1): ``0`` = sin
corte, que es el presupuesto fijo que pide el plan.
``--delta`` declara la diferencia mínima material en km (por defecto, 1 % de la referencia voraz).
``--reference-run-id`` declara qué corrida guardada sirve de referencia a la fase (C3.3 la
necesita: el factorial tiene varias hipótesis y la «más reciente» no siempre es la citable).
"""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.aco_sensitivity_service import (
    STANDARD_CASE,
    calibration_resume_path,
    run_aco_sensitivity,
)
from app.services.calibration_method_service import (
    PROTOCOL_SEEDS,
    analyze_budget,
    analyze_factorial,
    analyze_global,
    analyze_no_cut,
    analyze_noise,
    analyze_objective,
    analyze_ratio,
    analyze_rsm,
    analyze_validation,
    best_config_from_factorial,
    budget_cases,
    factorial_cases,
    format_budget_analysis,
    format_factorial_analysis,
    format_global_analysis,
    format_no_cut_analysis,
    format_noise_analysis,
    format_objective_analysis,
    format_ratio_analysis,
    format_recommendation,
    format_rsm_analysis,
    format_validation_analysis,
    no_cut_cases,
    objective_candidate_cases,
    ratio_cases,
    recommend_profile,
    rsm_cases,
    validation_cases,
)
from app.services.calibration_evidence_service import (
    PHASES,
    resolve_entries,
    seed_count,
)
from app.services.calibration_sweep_store import get_sweep, latest_payload_of_phase, latest_row
from app.services.instance_fingerprint import current_fingerprint
from app.services.multiobjective_sweep_service import load_multiobjective_sweep
from app.services.worker_pool import MAX_DEFAULT_WORKERS, default_workers

# Identificador propio del protocolo: la vista de calibración sigue leyendo los suyos.
SWEEP_METHOD = "method"

DEFAULT_SCENARIO_ID = "normal"

# Semillas por defecto del protocolo (lista única en el servicio del método).
DEFAULT_SEEDS: tuple[int, ...] = PROTOCOL_SEEDS

# Coste **medido**, no estimado: C1 del 2026-09-17 gastó 128.9 s en 10 corridas (12.9 s por
# corrida de pared, con 3.7 s de motor y 2.2 s de ACO para 20 iteraciones). Sustituye a la
# estimación de 19 s/corrida que se usó antes de instrumentar el contexto.
SECONDS_PER_RUN_MEASURED = 12.9

# δ declarado del protocolo (decisión cerrada del backlog §2): 1 % de la referencia voraz de C1.
# Es el mismo umbral para todas las fases, así que C7 lo recibe explícito: la referencia voraz del
# bloque de 8 h (~387 km) no es la del perfil estándar (~507 km) y derivar 1 % de ella cambiaría
# el δ del estudio en silencio.
PROTOCOL_DELTA_KM = 5.07

PENDING_PHASES: dict[str, str] = {}


@dataclass(frozen=True)
class PhaseOptions:
    """Opciones comunes de una fase del protocolo."""

    scenario_id: str
    seeds: list[int]
    patience: int | None
    delta_km: float | None
    reuse: bool
    run_id: int | None
    dry_run: bool
    reference_run_id: int | None = None
    profile_only: bool = False
    resume: bool = False
    workers: int = 1

    @property
    def stored_only(self) -> bool:
        """¿Solo se analiza evidencia guardada? (``--reuse`` o ``--run-id``)."""
        return self.reuse or self.run_id is not None


def _parse_seeds(raw: str) -> list[int]:
    """Semillas separadas por comas, sin repetir y conservando el orden."""
    values: list[int] = []
    for chunk in raw.split(","):
        text = chunk.strip()
        if not text:
            continue
        value = int(text)
        if value not in values:
            values.append(value)
    if not values:
        raise ValueError("La lista de semillas está vacía")
    return values


def _print_plan(title: str, cases: list[dict[str, Any]], seeds: list[int]) -> int:
    """Resumen del plan de corridas antes de lanzarlo. Devuelve el número de corridas."""
    work = sorted({int(case["acoAnts"]) * int(case["acoIterations"]) for case in cases})
    runs = len(cases) * len(seeds)
    seconds = runs * SECONDS_PER_RUN_MEASURED
    print(f"═══ {title} ═══")
    print(f"  casos        : {len(cases)} · semillas: {len(seeds)}")
    print(f"  semillas     : {', '.join(str(value) for value in seeds)}")
    print(
        "  presupuesto  : "
        f"{min(work)}–{max(work)} ant-iteraciones "
        f"({'uniforme' if work[0] == work[-1] else 'NO uniforme'})"
    )
    print(f"  corridas     : {runs}")
    print(
        f"  coste medido : {seconds:.0f} s ≈ {seconds / 60:.1f} min "
        f"(a {SECONDS_PER_RUN_MEASURED:.1f} s/corrida medidos en C1)"
    )
    if len(cases) <= 24:
        for case in cases:
            print(
                f"    · {case.get('label')} ({case['acoAnts']}×{case['acoIterations']}"
                f", axis={case.get('axis')}, paciencia={case.get('acoPatience', 'heredada')})"
            )
    if any(case.get("acoPatience") == 0 for case in cases):
        print(
            "  protocolo    : sin corte por paciencia (acoPatience=0) → cada corrida agota sus "
            "iteraciones y el coste medido es un mínimo"
        )
    return runs


def _clock(seconds: float) -> str:
    minutes, rest = divmod(int(seconds), 60)
    return f"{minutes}m {rest:02d}s" if minutes else f"{rest}s"


def _heartbeat(total_runs: int) -> Callable[[dict[str, Any]], None]:
    """Latido por corrida terminada: sin esto, un barrido largo parece colgado.

    Imprime distancia, ondas efectivas y ritmo (transcurrido y restante estimado) para poder
distinguir «avanza despacio» de «se quedó pegado». El restante es una proyección lineal al
ritmo observado, así que se corrige sola si unas corridas son más baratas que otras.
    """
    started = time.monotonic()
    done = 0

    def report(run: dict[str, Any]) -> None:
        nonlocal done
        done += 1
        elapsed = time.monotonic() - started
        remaining = (elapsed / done) * max(0, total_runs - done)
        if "error" in run:
            detail = f"✗ {run['error']}"
        else:
            detail = (
                f"{run.get('distanceKmOptimized')} km · "
                f"{run.get('acoIterationsRun')} iter · {run.get('acoSeconds')} s ACO"
            )
        print(
            f"  [{done:3d}/{total_runs}] {run.get('label')} → {detail}"
            f"   (transcurrido {_clock(elapsed)}, restante ≈{_clock(remaining)})",
            flush=True,
        )

    return report


def _load_or_run(
    db: Session,
    *,
    phase: str,
    cases: list[dict[str, Any]],
    options: PhaseOptions,
) -> dict[str, Any] | None:
    """Evidencia de la fase: la guardada (``--reuse``) o una corrida nueva."""
    if options.run_id is not None:
        stored = get_sweep(db, str(options.run_id))
        if stored is None:
            print(f"  ✗ No existe la corrida {options.run_id} en calibration_sweeps.")
            return None
        payload = stored.get("payload") or {}
        print(
            f"  evidencia    : corrida {options.run_id} de calibration_sweeps "
            f"({payload.get('generatedAt')})"
        )
        return payload

    if options.reuse:
        payload = latest_payload_of_phase(db, sweep=SWEEP_METHOD, phase=phase)
        if payload is None:
            print(f"  ✗ No hay evidencia guardada de la fase '{phase}'. Córrela sin --reuse.")
            return None
        print(f"  evidencia    : reutilizada de la BD ({payload.get('generatedAt')})")
        return payload

    payload = run_aco_sensitivity(
        db,
        scenario_id=options.scenario_id,
        seeds=options.seeds,
        cases=cases,
        phase=phase,
        sweep=SWEEP_METHOD,
        on_result=_heartbeat(len(cases) * len(options.seeds)),
        instance_fingerprint=current_fingerprint(db, scenario_id=options.scenario_id),
        resume_path=calibration_resume_path(sweep=SWEEP_METHOD, phase=phase),
        resume=options.resume,
        workers=options.workers,
    )
    row = latest_row(db, sweep=SWEEP_METHOD)
    print(f"  guardado     : calibration_sweeps id={row.id if row else '—'} (sweep '{SWEEP_METHOD}')")
    print(f"  duración     : {payload['durationSeconds']} s")
    return payload


def _load_reference(db: Session, *, phase: str, run_id: int | None) -> dict[str, Any] | None:
    """Evidencia de referencia de otra fase (p. ej. el factorial citable para C3.3).

    Las fases que comparan contra evidencia previa necesitan saber **qué** corrida es la
    referencia: el factorial tiene varias hipótesis guardadas (fontanería y citable) y la
    «más reciente» no es necesariamente la buena. ``--reference-run-id`` lo declara.
    """
    if run_id is not None:
        stored = get_sweep(db, str(run_id))
        if stored is None:
            print(f"  ✗ No existe la corrida de referencia {run_id} en calibration_sweeps.")
            return None
        payload = stored.get("payload") or {}
        print(
            f"  referencia   : corrida {run_id} de calibration_sweeps "
            f"(fase '{payload.get('phase')}', {payload.get('generatedAt')})"
        )
        return payload
    payload = latest_payload_of_phase(db, sweep=SWEEP_METHOD, phase=phase)
    if payload is None:
        print(f"  ✗ No hay evidencia guardada de la fase de referencia '{phase}'.")
        return None
    print(f"  referencia   : última corrida de la fase '{phase}' ({payload.get('generatedAt')})")
    return payload


def _recommended_profile(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """Perfil recomendado de E4, sintetizado desde la evidencia guardada (sin CPU).

    Consume el factorial (la referencia declarada) y la última corrida de identificación, y
    aplica :func:`recommend_profile`. Es la pieza que hace que C6 valide **el perfil de la
    evidencia** y no uno escrito a mano en el CLI (decisión D4).
    """
    factorial = _load_reference(db, phase="factorial", run_id=options.reference_run_id)
    if factorial is None:
        return None
    ratio = latest_payload_of_phase(db, sweep=SWEEP_METHOD, phase="identify")
    if ratio is None:
        print("  aviso        : sin evidencia de C4; el par α×β se decidirá de forma conservadora")
    factorial_analysis = analyze_factorial(factorial, delta_km=options.delta_km)
    ratio_analysis = (
        analyze_ratio(ratio, delta_km=options.delta_km) if ratio is not None else None
    )
    return recommend_profile(factorial_analysis, ratio_analysis, delta_km=options.delta_km)


def _print_run_summary(payload: dict[str, Any]) -> None:
    distances = sorted(
        float(run["distanceKmOptimized"])
        for run in payload["runs"]
        if "error" not in run and run.get("distanceKmOptimized") is not None
    )
    if distances:
        print(
            f"  distancia    : min {distances[0]} km · máx {distances[-1]} km "
            f"· recorrido {round(distances[-1] - distances[0], 2)} km (n={len(distances)})"
        )
    first = payload["runs"][0] if payload.get("runs") else {}
    print(
        "  contexto     : "
        + ", ".join(
            f"{key}={first.get(key)}"
            for key in (
                "acoPatience",
                "twoOptPasses",
                "pheromoneElitist",
                "workloadBalanceWeight",
                "makespanWeight",
                "minActiveVehicles",
            )
        )
    )
    iterations = sorted(
        {run.get("acoIterationsRun") for run in payload["runs"] if "error" not in run}
    )
    print(f"  iteraciones  : ejecutadas {[value for value in iterations if value is not None]}")
    for run in payload["runs"]:
        if "error" in run:
            print(f"    ✗ {run['label']}: {run['error']}")


def phase_noise(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C1 — Ruido base: perfil estándar replicado con las semillas del protocolo.

    Mide la dispersión entre semillas y **deriva δ y n** (plan §C1). Ejecuta el perfil estándar
    tal cual, sin variar ninguna otra perilla: su objeto es el ruido del motor, no comparar
    configuraciones.
    """
    label = (
        "perfil estándar"
        if options.patience is None or options.patience > 0
        else "perfil estándar (sin corte)"
    )
    case: dict[str, Any] = {**STANDARD_CASE, "label": label}
    if options.patience is not None:
        case["acoPatience"] = options.patience
    cases = [case]

    if not options.stored_only:
        _print_plan("C1 · ruido base (perfil estándar)", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="noise", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_noise(payload, delta_km=options.delta_km)
    print()
    for line in format_noise_analysis(analysis):
        print(line)
    return analysis


def phase_factorial(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C3 — Factorial completo 2⁴ (α, β, ρ, paciencia) + 4 centros.

    La paciencia entra como **factor declarado** (no heredada), que es lo que H4 del plan pedía:
    con la regla de parada fuera del diseño, el recorte por estancamiento se confundía con una
    diferencia real entre configuraciones. El presupuesto (hormigas × iteraciones) queda fijo y
    lo trata C3.2.
    """
    cases = factorial_cases()
    if not options.stored_only:
        _print_plan("C3 · factorial 2⁴ + centros", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="factorial", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_factorial(payload, delta_km=options.delta_km)
    print()
    for line in format_factorial_analysis(analysis):
        print(line)
    return analysis


def phase_budget(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C3.2 — Eje de presupuesto (hormigas, iteraciones) a trabajo fijo.

    El eje reparte 240 ant-iteraciones entre hormigas e iteraciones —lo que hace interpretable
    el eje de hormigas (H6)— y añade el brazo creciente de 40 iteraciones, que es lo que decide
    si el techo del presupuesto sube. La paciencia se fija explícitamente (por defecto 0, sin
    corte) para que el eje mida el reparto del presupuesto y no el recorte por estancamiento.
    """
    cases = budget_cases(patience=int(options.patience or 0))
    if not options.stored_only:
        _print_plan("C3.2 · eje de presupuesto", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="budget", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_budget(payload, delta_km=options.delta_km)
    print()
    for line in format_budget_analysis(analysis):
        print(line)
    return analysis


def phase_nocut(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C3.3 — Brazo de control sin corte: perfil estándar y mejor de C3, con `acoPatience = 0`.

    La referencia es el factorial ya corrido (`--reference-run-id`): el brazo sin corte no
    repite las corridas con corte, las reutiliza. El mejor de C3 se hereda de la evidencia, no
    se copia a mano.
    """
    reference = _load_reference(db, phase="factorial", run_id=options.reference_run_id)
    if reference is None:
        return None
    best = best_config_from_factorial(analyze_factorial(reference, delta_km=options.delta_km))
    if best is None:
        print("  ✗ El factorial de referencia no es comparable: no hay mejor configuración que heredar.")
        return None
    cases = no_cut_cases(best)
    if not options.stored_only:
        _print_plan("C3.3 · brazo sin corte", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="nocut", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_no_cut(payload, reference, delta_km=options.delta_km)
    print()
    for line in format_no_cut_analysis(analysis):
        print(line)
    return analysis


def phase_identify(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C4 — Identificación de la razón r = β/α y validación de Q.

    Seis puntos con ρ y paciencia declarados: dos pares de razón constante con nitidez distinta
    (para ver si α cambia el orden o solo la nitidez de la ruleta) y dos niveles de Q sobre el
    perfil estándar. La familia de contrastes es pre-declarada; Holm la ajusta.
    """
    cases = ratio_cases()
    if not options.stored_only:
        _print_plan("C4 · identificación r = β/α y Q", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="identify", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_ratio(payload, delta_km=options.delta_km)
    print()
    for line in format_ratio_analysis(analysis):
        print(line)
    return analysis


def phase_rsm(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C5 — Superficie de respuesta local (Box-Behnken) alrededor del perfil recomendado.

    Tres factores (β, ρ, I) y 15 puntos: es la fase que cambia «mínimo de 3 niveles» por
    «meseta de equivalencia con incertidumbre». El diseño se ancla en el perfil que sale de E4.
    Sin ese perfil no se lanza.
    """
    recommendation = _recommended_profile(db, options)
    if recommendation is None:
        return None
    if not recommendation.get("available"):
        print(f"  ✗ No hay perfil recomendado: {recommendation.get('reason')}")
        return None
    cases = rsm_cases(recommendation["profile"])
    if not options.stored_only:
        _print_plan("C5 · superficie de respuesta local (Box-Behnken)", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="rsm", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_rsm(payload, delta_km=options.delta_km)
    print()
    for line in format_rsm_analysis(analysis):
        print(line)
    return analysis


def phase_validate(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C6 — Validación replicada de la combinación recomendada frente al control.

    El perfil a validar sale de E4 (no se copia a mano): se sintetiza desde el factorial
    (`--reference-run-id`) y la identificación de C4. Dos puntos × las semillas del protocolo,
    con Wilcoxon pareado, IC bootstrap y TOST contra el mismo δ.
    """
    recommendation = _recommended_profile(db, options)
    if recommendation is None:
        return None
    if not recommendation.get("available"):
        print(f"  ✗ No hay perfil recomendado: {recommendation.get('reason')}")
        return None
    cases = validation_cases(recommendation["profile"])
    if not options.stored_only:
        _print_plan("C6 · validación replicada", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="validate", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_validation(payload, delta_km=options.delta_km)
    print()
    for line in format_validation_analysis(analysis):
        print(line)
    return analysis


def phase_objective(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C7 — Réplica de las candidatas del bloque de 8 h del barrido de pesos.

    No hay diseño nuevo: las candidatas se leen del barrido de pesos ya guardado
    (`multiobjective_sweep_service`) y se replican con el presupuesto del protocolo (12×20) y
    las semillas declaradas. AC-1 y AC-2 se evalúan sobre la **mediana**, con su intervalo.
    """
    source = load_multiobjective_sweep(db)
    if source is None:
        print("  ✗ No hay barrido de pesos del objetivo. Corre antes: just phase13-sweep")
        return None
    try:
        cases = objective_candidate_cases(source)
    except ValueError as exc:
        print(f"  ✗ {exc}")
        return None
    if not options.stored_only:
        _print_plan("C7 · réplica de las candidatas del bloque 8 h", cases, options.seeds)
    if options.dry_run:
        print("  (--dry-run: no se ejecuta nada)")
        return None

    payload = _load_or_run(db, phase="objective", cases=cases, options=options)
    if payload is None:
        return None
    if not options.stored_only:
        _print_run_summary(payload)

    analysis = analyze_objective(payload, delta_km=options.delta_km or PROTOCOL_DELTA_KM)
    print()
    for line in format_objective_analysis(analysis):
        print(line)
    return analysis


def phase_report(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """C8 — Reporte del capítulo, regenerado desde la BD (0 CPU).

    Ensambla las tablas de todas las fases desde `calibration_sweeps` y las escribe en
    ``docs/fase-13/evidencia-calibracion-metodologica.md``, junto con las figuras F1–F4 en PNG
    cuando la evidencia las permite. Con ``--profile`` solo imprime la síntesis de la
    recomendación (E4), que es útil para revisar el perfil sin regenerar el documento.
    """
    if options.profile_only:
        recommendation = _recommended_profile(db, options)
        if recommendation is None:
            return None
        if not recommendation.get("available"):
            print(f"  ✗ No hay perfil recomendado: {recommendation.get('reason')}")
            return None
        print()
        for line in format_recommendation(recommendation):
            print(line)
        return recommendation

    print("  evidencia    : leyendo de calibration_sweeps (0 CPU)")
    entries = resolve_entries(db, reference_run_id=options.reference_run_id)
    for phase in PHASES:
        entry = entries.get(phase)
        if entry is None:
            print(f"  ✗ fase '{phase}': sin evidencia")
            continue
        run_id, payload = entry
        print(
            f"  ✓ fase '{phase}': corrida {run_id} "
            f"({seed_count(payload)} semillas, {payload.get('generatedAt')})"
        )
    if entries.get("factorial") is None:
        print("  ✗ Sin factorial no hay reporte: pásalo con --reference-run-id N.")
        return None
    figures = _render_report_figures(entries, delta_km=options.delta_km)
    lines = report_lines(entries, delta_km=options.delta_km, figures=figures)

    path = _report_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  ✓ reporte      : {path}")
    if figures:
        print(f"  ✓ figuras      : {', '.join(figures.values())} (en {path.parent})")
    else:
        print("  aviso        : sin figuras (falta la evidencia del factorial)")
    return {"path": str(path), "lines": len(lines), "figures": figures}


def _render_report_figures(
    entries: dict[str, tuple[int, dict[str, Any]] | None], *, delta_km: float | None = None
) -> dict[str, str]:
    """Genera las figuras F1–F4 (PNG) junto al documento y devuelve ``{clave: fichero}``.

    F1–F3 salen del factorial de referencia; F4 solo si hay evidencia replicada de C7. El import
    es perezoso a propósito: matplotlib es pesado y el análisis puro del protocolo (el que corren
    los tests) no debe arrastrarlo.
    """
    factorial_entry = entries.get("factorial")
    if factorial_entry is None:
        return {}
    try:
        from app.services.calibration_figures_service import render_figures
    except ImportError as exc:  # matplotlib no disponible: el documento sigue siendo válido
        print(f"  aviso        : sin figuras (matplotlib no disponible: {exc})")
        return {}
    objective_entry = entries.get("objective")
    objective_analysis = (
        analyze_objective(objective_entry[1], delta_km=delta_km or PROTOCOL_DELTA_KM)
        if objective_entry is not None
        else None
    )
    return render_figures(
        factorial_entry[1],
        _report_path().parent,
        objective_analysis=objective_analysis,
    )


def report_lines(
    entries: dict[str, tuple[int, dict[str, Any]] | None],
    *,
    delta_km: float | None = None,
    figures: dict[str, str] | None = None,
) -> list[str]:
    """Ensambla el documento de C8 desde los payloads guardados (función pura).

    Cada sección es la tabla de su fase, con el id de `calibration_sweeps` que la sostiene. Las
    fases sin evidencia se declaran como tales en vez de omitirse: el capítulo debe poder decir
    «esto falta» sin que el lector lo adivine.
    """
    factorial_entry = entries.get("factorial")
    if factorial_entry is None:
        raise ValueError("El reporte necesita el factorial de referencia")
    factorial_id, factorial = factorial_entry
    noise = entries.get("noise")
    budget = entries.get("budget")
    nocut = entries.get("nocut")
    identify = entries.get("identify")
    validate = entries.get("validate")
    objective = entries.get("objective")
    rsm = entries.get("rsm")

    delta = delta_km if delta_km is not None else PROTOCOL_DELTA_KM
    factorial_analysis = analyze_factorial(factorial, delta_km=delta_km)
    ratio_analysis = (
        analyze_ratio(identify[1], delta_km=delta_km) if identify is not None else None
    )
    recommendation = recommend_profile(factorial_analysis, ratio_analysis, delta_km=delta_km)

    lines: list[str] = [
        "# Evidencia — Calibración metodológica del motor ACO (Fase 13)",
        "",
        "| Campo | Valor |",
        "|---|---|",
        "| **Generado desde** | `calibration_sweeps` (`just calib-report`, 0 CPU) |",
        f"| **Protocolo declarado** | δ = {delta:g} km · n = 10 semillas · I = 20 · perfil estándar 12×20 α1 β3 ρ0.12 Q1 · escenario `normal` |",
        f"| **Factorial de referencia** | `calibration_sweeps` id {factorial_id} |",
        "| **Relación** | [plan-calibracion-metodologica.md](./plan-calibracion-metodologica.md) · [backlog](./backlog-calibracion-metodologica.md) |",
        "",
        "## 1. Protocolo y trazabilidad (T1)",
        "",
    ]
    lines += _traceability_table(factorial, entries)

    lines += ["", "## 2. Ruido base y umbrales (T2)", ""]
    if noise is not None:
        lines += format_noise_analysis(analyze_noise(noise[1], delta_km=delta_km))
    else:
        lines.append("_Sin evidencia de C1._")

    lines += ["", "## 3. Efectos e interacciones del factorial 2⁴ (T5)", ""]
    lines += format_factorial_analysis(factorial_analysis)

    lines += ["", "## 4. Eje de presupuesto a trabajo fijo (T6)", ""]
    if budget is not None:
        lines += format_budget_analysis(analyze_budget(budget[1], delta_km=delta_km))
    else:
        lines.append("_Sin evidencia de C3.2._")

    lines += ["", "## 5. Brazo de control sin corte (C3.3)", ""]
    if nocut is not None:
        lines += format_no_cut_analysis(analyze_no_cut(nocut[1], factorial, delta_km=delta_km))
    else:
        lines.append("_Sin evidencia de C3.3._")

    lines += ["", "## 6. Identificación r = β/α y validación de Q (T3/T4)", ""]
    if ratio_analysis is not None:
        lines += format_ratio_analysis(ratio_analysis)
    else:
        lines.append("_Sin evidencia de C4._")

    lines += ["", "## 7. Síntesis de la recomendación (E4)", ""]
    lines += format_recommendation(recommendation)

    lines += ["", "## 8. Validación replicada de la combinación (T8)", ""]
    if validate is not None:
        lines += format_validation_analysis(analyze_validation(validate[1], delta_km=delta_km))
    else:
        lines.append("_Sin evidencia de C6._")

    lines += ["", "## 9. Pesos del objetivo (C7)", ""]
    if objective is not None:
        lines += format_objective_analysis(analyze_objective(objective[1], delta_km=delta))
    else:
        lines.append("_Sin evidencia de C7._")

    lines += ["", "## 10. Superficie de respuesta local (T7)", ""]
    if rsm is not None:
        lines += format_rsm_analysis(analyze_rsm(rsm[1], delta_km=delta_km))
    else:
        lines.append("_Sin evidencia de C5._")

    lines += ["", "## 11. Estadístico global (T9)", ""]
    lines += format_global_analysis(analyze_global(factorial, delta_km=delta_km))

    pending: list[str] = []
    if figures is None:
        pending.append(
            "- Las figuras **F1–F4** no se adjuntan en esta ruta: las genera `just calib-report` "
            "como PNG junto al documento."
        )
    else:
        from app.services.calibration_figures_service import figures_markdown

        lines += figures_markdown(figures)
        if "f4" not in figures:
            pending.append(
                "- **F4** (frontera de pesos) requiere la evidencia replicada de C7: córrela con "
                "`just calib-objective`."
            )
    if pending:
        lines += ["", "## 12. Pendiente", ""] + pending + [""]
    return lines


def _seed_count(payload: dict[str, Any]) -> int:
    """Alias local del contador de semillas del servicio de evidencia."""
    return seed_count(payload)


def _traceability_table(
    factorial: dict[str, Any], entries: dict[str, tuple[int, dict[str, Any]] | None]
) -> list[str]:
    """T1: de dónde sale cada tabla (id de `calibration_sweeps` y contexto de medición)."""
    lines = ["| Fase | Corrida | Semillas | Fecha |", "|---|---|---|---|"]
    for phase, entry in entries.items():
        if entry is None:
            lines.append(f"| {phase} | — | — | — |")
            continue
        run_id, payload = entry
        lines.append(
            f"| {phase} | id {run_id} | {_seed_count(payload)} | {payload.get('generatedAt')} |"
        )
    budget = factorial.get("budget") or {}
    work = budget.get("workUnits") or {}
    lines += [
        "",
        (
            f"Contexto del factorial de referencia: escenario `{factorial.get('scenarioId')}` · "
            f"presupuesto declarado `{budget.get('cases')}` casos × `{budget.get('replicates')}` "
            f"semillas = `{budget.get('runs')}` corridas · trabajo `{work.get('min')}–{work.get('max')}` "
            f"ant-iteraciones · iteraciones fijas: `{(budget.get('iterations') or {}).get('fixed')}`."
        ),
        "",
        (
            "Hiperparámetros estándar del protocolo: "
            f"`{factorial.get('standardHyperparameters')}` · perfil `{factorial.get('standardProfile')}`."
        ),
    ]
    return lines


def _repo_root() -> Path:
    """Raíz del repo, robusta al contenedor (misma estrategia que el reporte de Fase 3).

    En el host el script vive en ``<repo>/backend/scripts``; dentro del contenedor ``/app`` es
    el montaje de ``backend`` y ``/app/docs`` el de ``docs``. Se ancla a la primera carpeta que
    contenga ``docs/fase-13``.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "docs" / "fase-13").is_dir():
            return parent
    return here.parents[2]


def _report_path() -> Path:
    return _repo_root() / "docs" / "fase-13" / "evidencia-calibracion-metodologica.md"


def phase_heatmap(db: Session, options: PhaseOptions) -> dict[str, Any] | None:
    """F5 — Mapa de calor β×ρ del modelo RSM con la región ≤ mejor + δ (0 CPU).

    Lee la evidencia de C5 (Box-Behnken de β, ρ, I), evalúa la superficie en el plano β×ρ con
    I en el centro, marca el contorno «mejor + δ» y superpone las celdas medidas. Es una lectura
    **visual** de C5 que complementa a F1–F4; el veredicto sigue siendo el de C5/C6.
    """
    payload = _load_reference(db, phase="rsm", run_id=options.run_id)
    if payload is None:
        return None
    from app.services.calibration_method_service import beta_rho_surface

    surface = beta_rho_surface(payload, delta_km=options.delta_km)
    if surface is None:
        print("  ✗ La evidencia RSM no alcanza: falta el Box-Behnken completo de C5.")
        return None
    try:
        from app.services.calibration_figures_service import render_beta_rho_heatmap
    except ImportError as exc:  # matplotlib no disponible: el resto del protocolo sigue
        print(f"  aviso        : sin figura (matplotlib no disponible: {exc})")
        return None
    path = _report_path().parent / "f5-heatmap-beta-rho.png"
    if render_beta_rho_heatmap(surface, path) is None:
        return None
    print(f"  ✓ mapa β×ρ   : {path}")
    print(
        f"    mejor predicho {surface['bestKm']:.1f} km · umbral mejor+δ "
        f"{surface['thresholdKm']:.1f} km (I = {surface['iterationsCenter']:g})"
    )
    return {"path": str(path), "bestKm": surface["bestKm"], "thresholdKm": surface["thresholdKm"]}


PHASE_HANDLERS = {
    "noise": phase_noise,
    "factorial": phase_factorial,
    "budget": phase_budget,
    "nocut": phase_nocut,
    "identify": phase_identify,
    "rsm": phase_rsm,
    "validate": phase_validate,
    "objective": phase_objective,
    "report": phase_report,
    "heatmap": phase_heatmap,
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Protocolo de calibración metodológica del motor ACO (C1–C8)."
    )
    parser.add_argument("phase", choices=sorted(PHASE_HANDLERS), help="fase del protocolo")
    parser.add_argument(
        "--scenario", default=DEFAULT_SCENARIO_ID, help="escenario de la corrida (por defecto: normal)"
    )
    parser.add_argument(
        "--seeds",
        default=",".join(str(value) for value in DEFAULT_SEEDS),
        help="semillas separadas por comas (números aleatorios comunes)",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=0,
        help="regla de parada de las fases que no la fijan en su diseño (C1): 0 = sin corte, "
        "N = corta tras N iteraciones sin mejora",
    )
    parser.add_argument(
        "--delta",
        type=float,
        default=None,
        help="diferencia mínima material δ en km (por defecto: 1 %% de la referencia voraz)",
    )
    parser.add_argument(
        "--reuse",
        action="store_true",
        help="no ejecutar nada: analizar la última evidencia guardada de la fase",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="reanudar un barrido cortado: reutiliza las corridas ya terminadas del salvavidas "
        "(data/cache/phase13/) y ejecuta solo las que faltan",
    )
    parser.add_argument(
        "--run-id",
        type=int,
        default=None,
        help="analizar una corrida concreta de calibration_sweeps (implica --reuse)",
    )
    parser.add_argument(
        "--reference-run-id",
        type=int,
        default=None,
        help="corrida de calibration_sweeps que sirve de referencia a la fase "
        "(p. ej. el factorial citable para el brazo sin corte)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="imprime el plan y el coste estimado sin ejecutar corridas",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers(),
        help=(
            "corridas en paralelo por proceso "
            f"(default: min(núcleos, {MAX_DEFAULT_WORKERS}) = {default_workers()}); 1 = secuencial"
        ),
    )
    parser.add_argument(
        "--profile",
        action="store_true",
        help="(fase report) imprime solo la síntesis de la recomendación de E4, sin escribir el "
        "documento",
    )
    args = parser.parse_args()

    try:
        seeds = _parse_seeds(args.seeds)
    except ValueError as exc:
        print(f"✗ Semillas inválidas: {exc}")
        return 2

    options = PhaseOptions(
        scenario_id=args.scenario,
        seeds=seeds,
        patience=args.patience,
        delta_km=args.delta,
        reuse=args.reuse,
        run_id=args.run_id,
        dry_run=args.dry_run,
        reference_run_id=args.reference_run_id,
        profile_only=args.profile,
        resume=args.resume,
        workers=args.workers,
    )

    phase = PHASE_HANDLERS[args.phase]
    try:
        with SessionLocal() as db:
            phase(db, options)
    except NotImplementedError as exc:
        print(f"⏸  Fase '{args.phase}' ({PENDING_PHASES.get(args.phase, '—')}): {exc}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
