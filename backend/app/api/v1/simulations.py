from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, OperationsStaff, OptionalUser, PlannerOrAdmin
from app.schemas.simulation import OptimizeJobCancelResponse, OptimizeJobCreated, OptimizeJobStatus, OptimizeRequest
from app.services.dashboard_service import (
    get_kpis,
    list_scenarios,
    list_simulations,
    normalize_scenario_id,
    simulation_detail,
)
from app.services.optimization_job_service import (
    cancel_optimization_job,
    create_optimization_job,
    get_optimization_job_view,
)

router = APIRouter(tags=["simulations"])


@router.get("/scenarios")
def get_scenarios():
    return list_scenarios()


@router.get("/kpis")
def get_scenario_kpis(scenario: str = Query(default="normal")):
    try:
        return get_kpis(normalize_scenario_id(scenario))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Escenario no encontrado: {scenario}") from None


@router.post("/simulations/optimize", response_model=OptimizeJobCreated)
def optimize_simulation(body: OptimizeRequest, _: PlannerOrAdmin):
    try:
        job = create_optimization_job(
            scenario_id=body.scenario_id,
            rain_intensity=body.rain_intensity,
            waste_level_pct=body.waste_level_pct,
            estimated_duration_hours=body.estimated_duration_hours,
            operators_shortage=body.operators_shortage,
            aco_ants=body.aco_ants,
            aco_iterations=body.aco_iterations,
        )
        return {"jobId": job.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/simulations/jobs/{job_id}", response_model=OptimizeJobStatus)
def get_simulation_job(job_id: str, _: PlannerOrAdmin):
    try:
        return get_optimization_job_view(job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job no encontrado") from None


@router.post("/simulations/jobs/{job_id}/cancel", response_model=OptimizeJobCancelResponse)
def cancel_simulation_job(job_id: str, _: PlannerOrAdmin):
    try:
        return cancel_optimization_job(job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job no encontrado") from None


@router.get("/simulations")
def get_simulations(db: DbSession, limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    return list_simulations(db, limit=limit, offset=offset)


@router.get("/simulations/{simulation_id}")
def get_simulation(simulation_id: int, db: DbSession):
    try:
        return simulation_detail(db, simulation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Simulación no encontrada") from None
