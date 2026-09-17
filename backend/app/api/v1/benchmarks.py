"""API de benchmarks de observabilidad."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DbSession, PlannerOrAdmin
from app.schemas.calibration import (
    CalibrationJobCancelResponse,
    CalibrationJobCreated,
    CalibrationJobRequest,
    ObjectiveSweepJobRequest,
)
from app.services.aco_sensitivity_service import load_aco_sensitivity, run_aco_sensitivity
from app.services.algorithm_benchmark_service import (
    load_algorithms_benchmark,
    run_algorithms_benchmark,
)
from app.services.benchmark_service import load_aco_benchmark, run_aco_benchmark
from app.services.calibration_history_service import get_calibration_run, list_calibration_runs
from app.services.instance_fingerprint import with_freshness
from app.services.multiobjective_sweep_service import (
    load_multiobjective_sweep,
    validate_sweep_duration,
)
from app.services.optimization_job_service import (
    cancel_optimization_job,
    create_calibration_job,
    get_calibration_job_view,
)
from app.services.sweep_progress import (
    DEFAULT_SWEEP_SCENARIO,
    SWEEP_OBJECTIVE,
    SWEEP_SENSITIVITY,
)

router = APIRouter(tags=["benchmarks"])


@router.get("/benchmarks/aco")
def get_aco_benchmark(_: PlannerOrAdmin):
    payload = load_aco_benchmark()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay benchmark ACO generado. Ejecuta: just benchmark-aco",
        )
    return payload


@router.post("/benchmarks/aco")
def generate_aco_benchmark(db: DbSession, _: PlannerOrAdmin):
    return run_aco_benchmark(db)


@router.get("/benchmarks/algorithms")
def get_algorithms_benchmark(_: PlannerOrAdmin):
    payload = load_algorithms_benchmark()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay benchmark entre familias generado. Ejecuta POST /benchmarks/algorithms.",
        )
    return payload


@router.post("/benchmarks/algorithms")
def generate_algorithms_benchmark(_: PlannerOrAdmin):
    return run_algorithms_benchmark()


@router.get("/benchmarks/aco/sensitivity")
def get_aco_sensitivity(db: DbSession, _: PlannerOrAdmin):
    """Payload en caché + estado del sello de instancia (`cacheState`, `stale`)."""
    payload = load_aco_sensitivity()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay estudio de sensibilidad ACO. Ejecuta: just phase3-sensitivity",
        )
    return with_freshness(
        payload, db, scenario_id=payload.get("scenarioId") or DEFAULT_SWEEP_SCENARIO
    )


@router.post("/benchmarks/aco/sensitivity")
def generate_aco_sensitivity(
    db: DbSession,
    _: PlannerOrAdmin,
    scenario_id: str | None = Query(default=None, alias="scenarioId"),
    seed: int | None = Query(default=None),
):
    """Barrido síncrono (~315 s). Compatibilidad: acepta escenario y semilla opcionales."""
    overrides: dict[str, Any] = {}
    if scenario_id is not None:
        overrides["scenario_id"] = scenario_id
    if seed is not None:
        overrides["seed"] = seed
    return run_aco_sensitivity(db, **overrides)


# --------------------------------------------------------------------------- #
# Jobs asíncronos de calibración (Fase 13 · plan de la vista de calibración).
# --------------------------------------------------------------------------- #


def _start_calibration_job(sweep: str, body: CalibrationJobRequest) -> dict[str, str]:
    try:
        job = create_calibration_job(
            sweep,
            scenario_id=body.scenario_id,
            seed=body.seed,
            refresh=body.refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"jobId": job.id}


@router.post(
    "/benchmarks/aco/sensitivity/jobs",
    response_model=CalibrationJobCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_aco_sensitivity_job(body: CalibrationJobRequest, _: PlannerOrAdmin):
    """Lanza el barrido de sensibilidad ACO (18 corridas) como job asíncrono."""
    return _start_calibration_job(SWEEP_SENSITIVITY, body)


@router.post(
    "/benchmarks/objective/sweep/jobs",
    response_model=CalibrationJobCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_objective_sweep_job(body: ObjectiveSweepJobRequest, _: PlannerOrAdmin):
    """Lanza el barrido de pesos del objetivo (Fase 13) como job asíncrono.

    ``durationHours`` se acepta por contrato, pero solo como **declaración**: la jornada
    la fijan los casos del barrido, así que un valor que no cubra devuelve ``400``.
    """
    try:
        validate_sweep_duration(body.duration_hours)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _start_calibration_job(SWEEP_OBJECTIVE, body)


@router.get("/benchmarks/objective/sweep")
def get_objective_sweep(db: DbSession, _: PlannerOrAdmin):
    """Caché del barrido de pesos + estado del sello de instancia."""
    payload = load_multiobjective_sweep()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay barrido de pesos del objetivo. Ejecuta: just phase13-sweep",
        )
    return with_freshness(
        payload, db, scenario_id=payload.get("scenarioId") or DEFAULT_SWEEP_SCENARIO
    )


@router.get("/benchmarks/calibration/history")
def get_calibration_history(
    db: DbSession,
    _: PlannerOrAdmin,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Corridas de calibración guardadas (histórico; no toca la caché vigente)."""
    return list_calibration_runs(db, limit=limit, offset=offset)


@router.get("/benchmarks/calibration/history/{run_id}")
def get_calibration_history_run(run_id: str, db: DbSession, _: PlannerOrAdmin):
    """Payload completo de una corrida histórica, con su sello de instancia."""
    run = get_calibration_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Corrida de calibración no encontrada")
    return run


@router.get("/benchmarks/calibration/jobs/{job_id}")
def get_calibration_job(job_id: str, _: PlannerOrAdmin):
    try:
        return get_calibration_job_view(job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job no encontrado") from None


@router.post("/benchmarks/calibration/jobs/{job_id}/cancel", response_model=CalibrationJobCancelResponse)
def cancel_calibration_job(job_id: str, _: PlannerOrAdmin):
    try:
        return cancel_optimization_job(job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job no encontrado") from None
