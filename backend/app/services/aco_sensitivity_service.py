"""Estudio de sensibilidad ACO — Fase 3 (rigor algorítmico).

Fase C0 del plan de calibración metodológica (``docs/fase-13/plan-calibracion-metodologica.md``):
la evidencia de cada corrida registra el **contexto completo** con el que se midió, no solo
su resultado.

- La **serie de convergencia** por iteración que el motor ya calculaba y este servicio
descartaba (hallazgo H1 del plan).
- Los **pesos del objetivo** que el motor aplicó de verdad: λ_b, λ_t, flota mínima y jornada
objetivo (hallazgo H3).
- La **semilla** de cada corrida, para que las réplicas sean distinguibles.
- El **presupuesto declarado** (``acoAnts × acoIterations``) junto a las iteraciones
efectivamente ejecutadas, para que el recorte por paciencia no quede oculto (hallazgo H4).

Los hiperparámetros que un caso no varía se **fijan** a su valor estándar declarado en lugar
de heredarse de Administración: medir en un contexto fijo es lo que hace comparable la
evidencia entre barridos.

Pendiente (misma revisión que el Anexo A del plan): ``twoOptPasses`` y ``pheromoneElitist``
viajan por corrida y en ``engineMetrics``, y este servicio los registra con el resto del
contexto. El límite que queda es el de la huella: cubre lo que administra el planificador,
no lo que decide cada caso de estudio.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.services.calibration_sweep_store import latest_payload, record_sweep
from app.services.optimization_service import run_optimization_engine
from app.services.sweep_progress import (
    SWEEP_SENSITIVITY,
    CancelCheck,
    OnResult,
    OnRun,
    SweepCancelled,
)

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
# varía un parámetro y mantiene el perfil estándar (12×20). Los cuatro valores viajan
# **por corrida** (no se toca la configuración de Administración) y los que la serie no varía
# los rellena ``_case_hyperparameters`` con ``STANDARD_HYPERPARAMETERS``: así el barrido mide
# siempre en el mismo contexto y no hereda en silencio lo que haya en Administración.
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

# Caso del perfil estándar: réplica pura del perfil de referencia, sin variar ninguna perilla.
# Es el punto de control del protocolo de calibración (C1 del plan: ruido base).
STANDARD_CASE: dict[str, Any] = {
    "label": "perfil estándar",
    "axis": "standard",
    **_STANDARD_PROFILE,
}


def _default_series() -> list[dict[str, Any]]:
    """Las 18 corridas históricas del barrido de sensibilidad."""
    return [
        *ANT_SENSITIVITY_SERIES,
        *ITERATION_SENSITIVITY_SERIES,
        *HYPERPARAMETER_SENSITIVITY_SERIES,
    ]


# --------------------------------------------------------------------------- #
# Persistencia incremental del barrido (E0)
# --------------------------------------------------------------------------- #

# Umbral de flush de una corrida terminada al JSONL de trabajo en curso.
_WORKING_FILE_SUFFIX = ".jsonl"


def calibration_resume_path(*, sweep: str, phase: str | None = None) -> Path:
    """Ruta del salvavidas de trabajo en curso de un barrido y fase (E0).

    La BD sigue siendo la **única fuente de verdad** (ADR-011): la fila de
    ``calibration_sweeps`` se escribe al final. Este fichero solo existe para que un corte no
    cueste el barrido entero; se borra cuando la corrida llega a guardarse.
    """
    slot = phase or "default"
    return Path(settings.data_dir) / "cache" / "phase13" / f"{sweep}-{slot}{_WORKING_FILE_SUFFIX}"


def _case_identity(case: dict[str, Any], seed: int) -> str:
    """Clave estable ``(caso, semilla)`` para reanudar: el caso completo, tal como se declaró.

    Incluye la etiqueta **a propósito**: en el factorial las 4 réplicas del centro comparten
    parámetros y solo se distinguen por su etiqueta. Si la clave fuese solo el vector de
    parámetros, las cuatro colapsarían en una corrida y el chequeo de determinismo
    (``centerReplicatesIdentical``) pasaría por construcción, sin comprobar nada.
    """
    declared = {key: case[key] for key in sorted(case)}
    return json.dumps([declared, int(seed)], sort_keys=True, default=str)


def _load_working_runs(path: Path) -> dict[str, dict[str, Any]]:
    """Corridas ya terminadas del fichero de trabajo, indexadas por ``(caso, semilla)``.

    Un fichero corrupto o una línea ilegible no abortan la reanudación: se descarta lo que no
    se puede leer y se sigue (el salvavidas no puede ser un modo de fallo nuevo).
    """
    if not path.exists():
        return {}
    cached: dict[str, dict[str, Any]] = {}
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                text = line.strip()
                if not text:
                    continue
                try:
                    entry = json.loads(text)
                except json.JSONDecodeError:
                    continue
                identity = entry.get("identity")
                run = entry.get("run")
                if isinstance(identity, str) and isinstance(run, dict):
                    cached[identity] = run
    except OSError as exc:
        logger.warning("No se pudo leer el salvavidas %s: %s", path, exc)
        return {}
    return cached


def _open_working_file(path: Path) -> Any | None:
    """Abre (creando la carpeta) el fichero de trabajo; ``None`` si no se puede escribir."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        return path.open("a", encoding="utf-8")
    except OSError as exc:
        logger.warning(
            "Sin salvavidas de reanudación en %s (no escribible): %s. El barrido continúa, "
            "pero un corte perderá las corridas hechas.",
            path,
            exc,
        )
        return None


def _case_hyperparameters(case: dict[str, Any]) -> dict[str, float]:
    """Hiperparámetros efectivos de un caso: lo que varía, o el estándar declarado.

    Sin esto, un caso que solo varía ρ deja α/β/Q a lo que tenga la configuración de
    Administración en ese momento, y la evidencia hereda el contexto en silencio.
    """
    return {
        key: float(case.get(key, standard))
        for key, standard in STANDARD_HYPERPARAMETERS.items()
    }


def _budget_summary(
    case_list: Sequence[dict[str, Any]], seed_list: Sequence[int]
) -> dict[str, Any]:
    """Presupuesto declarado del barrido (C2 del plan de calibración metodológica).

    ``workUnits`` es ``acoAnts × acoIterations``, es decir las ondas declaradas. La
    comparación válida entre configuraciones exige que ese presupuesto sea uniforme y que
    la paciencia no recorte unas corridas y otras no.
    """
    work = sorted({int(case["acoAnts"]) * int(case["acoIterations"]) for case in case_list})
    iterations = sorted({int(case["acoIterations"]) for case in case_list})
    return {
        "cases": len(case_list),
        "replicates": len(seed_list),
        "runs": len(case_list) * len(seed_list),
        "seeds": [int(value) for value in seed_list],
        "workUnits": {"min": work[0], "max": work[-1], "uniform": work[0] == work[-1]},
        "iterations": {
            "min": iterations[0],
            "max": iterations[-1],
            "fixed": iterations[0] == iterations[-1],
        },
    }


def _convergence_of(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    """Serie de convergencia de la corrida (el motor ya la calculaba; hallazgo H1)."""
    series = metrics.get("acoConvergence")
    return list(series) if isinstance(series, list) else []


def load_aco_sensitivity(db: Session) -> dict[str, Any] | None:
    """Payload vigente de la sensibilidad (la corrida más reciente en la BD)."""
    return latest_payload(db, sweep=SWEEP_SENSITIVITY)


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
    aco_patience: int | None = None,
    two_opt_passes: int | None = None,
    pheromone_elitist: bool | None = None,
    estimated_duration_hours: int | None = None,
    workload_balance_weight: float | None = None,
    makespan_weight: float | None = None,
    min_active_vehicles: int | None = None,
    max_route_hours_target: float | None = None,
) -> dict[str, Any]:
    """Una corrida del barrido, con su contexto de medición completo.

    Regla de parada, local search y variante elitista viajan **por corrida** (``None`` = lo que
    tenga Administración) y el valor efectivo se registra igual que los demás: así el recorte
    por paciencia deja de ser una herencia invisible y puede ser un factor del diseño.

    Los pesos del objetivo se piden explícitamente en ``0.0`` para que la distancia sea el
    único término activo del objetivo combinado y el ranking por distancia sea el criterio
    que el motor minimiza de verdad. La flota mínima no se puede neutralizar sin activar la
    ruta multiobjetivo del motor, así que su valor efectivo se **registra**: si aparece no
    nulo, el ranking de distancia no es distancia pura.

    Las corridas del **barrido de pesos** (C7) sí declaran el escenario del objetivo —jornada,
    λ_b, λ_t y flota mínima— porque ahí los pesos son justamente lo que se mide; los defaults
    (`None`/`0.0`) mantienen idéntico el comportamiento de los demás barridos.
    """
    hyperparameters = {
        "acoAlpha": aco_alpha,
        "acoBeta": aco_beta,
        "acoRho": aco_rho,
        "pheromoneQ": pheromone_q,
    }
    declared = {
        "label": label,
        "scenarioId": scenario_id,
        "seed": seed,
        "acoAnts": aco_ants,
        "acoIterations": aco_iterations,
        "workUnits": int(aco_ants) * int(aco_iterations),
        "axis": axis,
        # Escenario del objetivo declarado (C7). Los barridos de un solo eje no lo declaran.
        "durationHours": estimated_duration_hours,
        "workloadBalanceWeightRequested": workload_balance_weight,
        "makespanWeightRequested": makespan_weight,
        "minActiveVehiclesRequested": min_active_vehicles,
        "maxRouteHoursTarget": max_route_hours_target,
        **hyperparameters,
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
            aco_patience=aco_patience,
            two_opt_passes=two_opt_passes,
            pheromone_elitist=pheromone_elitist,
            estimated_duration_hours=estimated_duration_hours,
            workload_balance_weight=0.0 if workload_balance_weight is None else workload_balance_weight,
            makespan_weight=0.0 if makespan_weight is None else makespan_weight,
            min_active_vehicles=min_active_vehicles,
            max_route_hours_target=max_route_hours_target,
            seed=seed,
            auto_commit=False,
            auto_dispatch=False,
            reporter=None,
        )
        db.rollback()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return {**declared, "error": str(exc)}

    kpis = result["kpis"]
    metrics = kpis.get("engineMetrics") or {}
    current_km = kpis["distanceKm"]["current"]
    optimized_km = kpis["distanceKm"]["optimized"]
    saving_pct = round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0

    return {
        **declared,
        "computationSeconds": round(float(metrics.get("computationSeconds", 0)), 2),
        "acoSeconds": round(float(metrics.get("acoSeconds", 0)), 2),
        "distanceKmOptimized": round(float(optimized_km), 2),
        "distanceKmBaseline": round(float(current_km), 2),
        "savingPct": saving_pct,
        "acoIterationsRun": metrics.get("acoIterationsRun", aco_iterations),
        "acoStoppedEarly": bool(metrics.get("acoStoppedEarly", False)),
        # KPIs de flota y jornada (C7): los pesos del objetivo se juzgan con estos, no solo con
        # la distancia. Se registran siempre; los barridos de un eje simplemente no los usan.
        "activeVehicles": int(kpis.get("activeVehicles") or 0),
        "maxRouteHours": round(float(kpis.get("maxRouteHours") or 0.0), 3),
        "finishUnderTargetPct": kpis.get("finishUnderTargetPct"),
        "workloadStdHours": kpis.get("workloadStdHours"),
        "fairnessIndex": kpis.get("fairnessIndex"),
        "fleetUtilizationPct": kpis.get("fleetUtilizationPct"),
        # Contexto efectivo de la corrida (C0): regla de parada, local search, objetivo y
        # convergencia.
        "acoPatience": metrics.get("acoPatience"),
        "twoOptPasses": metrics.get("twoOptPasses"),
        "pheromoneElitist": metrics.get("pheromoneElitist"),
        "workloadBalanceWeight": metrics.get("workloadBalanceWeight"),
        "makespanWeight": metrics.get("makespanWeight"),
        "minActiveVehicles": metrics.get("minActiveVehicles"),
        "maxRouteHoursTarget": metrics.get("maxRouteHoursTarget"),
        "uncoveredPoints": kpis.get("uncoveredPoints", 0),
        "acoConvergence": _convergence_of(metrics),
    }


def run_aco_sensitivity(
    db: Session,
    *,
    scenario_id: str = DEFAULT_SCENARIO_ID,
    seed: int = DEFAULT_SEED,
    seeds: Sequence[int] | None = None,
    cases: Sequence[dict[str, Any]] | None = None,
    phase: str | None = None,
    sweep: str = SWEEP_SENSITIVITY,
    on_run: OnRun | None = None,
    on_result: OnResult | None = None,
    cancel_check: CancelCheck | None = None,
    instance_fingerprint: str | None = None,
    resume_path: Path | None = None,
    resume: bool = False,
) -> dict[str, Any]:
    """Corridas del barrido (escenario dado, semilla(s) explícita(s)).

    Por defecto reproduce las 18 corridas históricas: hormigas 8/12/20 (iteraciones en 20),
    iteraciones 10/20/40 (hormigas en 12) e hiperparámetros α/β/ρ/Q en tres niveles cada uno.

    - ``cases`` permite ejecutar cualquier lista de casos en lugar de esas 18.
    - ``seeds`` replica **cada** caso con varias semillas: las mismas semillas para todos
      los casos (números aleatorios comunes), que es lo que hace comparables los pares de
      configuraciones en el plan de calibración.
    - ``phase`` viaja en la raíz del payload para que la evidencia se pueda separar por fase
      del protocolo sin abrir los ficheros.
    - ``sweep`` es el identificador con el que la corrida queda en ``calibration_sweeps``. El
      protocolo de calibración usa uno propio para no pisar la evidencia que consume la vista
      de calibración.

    El KPI de referencia es la **distancia optimizada** (decisión D2); el resto de columnas
    son guardarraíles.

    ``on_run``/``cancel_check`` conectan el barrido con el job asíncrono: ``on_run`` reporta
    el progreso antes de cada corrida y ``cancel_check`` corta entre corridas. Si se cancela,
    lanza :class:`SweepCancelled` y **no** guarda la corrida. ``on_result`` recibe cada corrida
    **terminada**, que es lo que permite ver avanzar un barrido largo por consola.

    ``resume_path`` es el salvavidas de trabajo en curso (E0): cada corrida terminada se anexa
    al fichero y, con ``resume=True``, las que ya están se reutilizan en lugar de recalcularse.
    La fila de ``calibration_sweeps`` se sigue escribiendo **al final** y el fichero se borra al
    guardarla: la BD es la verdad y el JSONL solo cubre el hueco de un corte.
    """
    started = datetime.now(timezone.utc)
    seed_list = [int(value) for value in seeds] if seeds else [int(seed)]
    case_list = list(cases) if cases else _default_series()
    replicated = len(seed_list) > 1
    total = len(case_list) * len(seed_list)
    runs: list[dict[str, Any]] = []

    cached: dict[str, dict[str, Any]] = {}
    working_file = None
    if resume_path is not None:
        if resume:
            cached = _load_working_runs(resume_path)
        else:
            # Corrida nueva: el journal anterior ya no describe este barrido.
            try:
                resume_path.unlink(missing_ok=True)
            except OSError:
                pass
        working_file = _open_working_file(resume_path)

    reused = 0
    plan = [(case, run_seed) for case in case_list for run_seed in seed_list]
    try:
        for index, (case, run_seed) in enumerate(plan):
            if cancel_check is not None and cancel_check():
                raise SweepCancelled(f"Sensibilidad ACO cancelada tras {len(runs)}/{total} corridas")
            base_label = str(case.get("label") or case.get("axis") or "corrida")
            label = f"{base_label} · semilla {run_seed}" if replicated else base_label
            if on_run is not None:
                on_run(index, total, label)
            identity = _case_identity(case, run_seed)
            previous = cached.get(identity) if resume else None
            if previous is not None:
                # Ya estaba hecha: se reutiliza el resultado, no se gasta CPU.
                reused += 1
                runs.append(previous)
                if on_result is not None:
                    on_result(previous)
                continue
            logger.info(
                "Sensibilidad ACO %s (%s×%s, semilla %s)",
                base_label,
                case["acoAnts"],
                case["acoIterations"],
                run_seed,
            )
            hyperparameters = _case_hyperparameters(case)
            run = _run_sensitivity_case(
                db,
                scenario_id=scenario_id,
                label=label,
                aco_ants=int(case["acoAnts"]),
                aco_iterations=int(case["acoIterations"]),
                axis=str(case.get("axis") or "custom"),
                seed=run_seed,
                aco_alpha=hyperparameters["acoAlpha"],
                aco_beta=hyperparameters["acoBeta"],
                aco_rho=hyperparameters["acoRho"],
                pheromone_q=hyperparameters["pheromoneQ"],
                aco_patience=case.get("acoPatience"),
                two_opt_passes=case.get("twoOptPasses"),
                pheromone_elitist=case.get("pheromoneElitist"),
                estimated_duration_hours=case.get("durationHours"),
                workload_balance_weight=case.get("workloadBalanceWeight"),
                makespan_weight=case.get("makespanWeight"),
                min_active_vehicles=case.get("minActiveVehicles"),
                max_route_hours_target=case.get("maxRouteHoursTarget"),
            )
            runs.append(run)
            if working_file is not None:
                working_file.write(json.dumps({"identity": identity, "run": run}, default=str) + "\n")
                working_file.flush()
            if on_result is not None:
                on_result(run)
    finally:
        if working_file is not None:
            working_file.close()

    finished = datetime.now(timezone.utc)
    payload = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 1),
        "scenarioId": scenario_id,
        "phase": phase,
        "seed": seed_list[0],
        "seeds": seed_list,
        "reusedRuns": reused,
        "budget": _budget_summary(case_list, seed_list),
        "standardProfile": {"acoAnts": 12, "acoIterations": 20},
        "standardHyperparameters": STANDARD_HYPERPARAMETERS,
        "instanceFingerprint": instance_fingerprint,
        "runs": runs,
    }
    record_sweep(
        db,
        sweep=sweep,
        payload=payload,
        instance_fingerprint=instance_fingerprint,
    )
    if resume_path is not None:
        # Guardado en la BD: el salvavidas ya cumplió su función.
        try:
            resume_path.unlink(missing_ok=True)
        except OSError:
            pass
    return payload
