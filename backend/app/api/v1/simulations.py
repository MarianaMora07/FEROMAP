from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, OperationsStaff, OptionalUser, PlannerOrAdmin
from app.schemas.simulation import OptimizeRequest
from app.services.dashboard_service import (
    get_kpis,
    list_scenarios,
    list_simulations,
    normalize_scenario_id,
    run_optimization,
    simulation_detail,
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


@router.post("/simulations/optimize")
def optimize_simulation(body: OptimizeRequest, db: DbSession, _: PlannerOrAdmin):
    try:
        return run_optimization(db, body.scenario_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/simulations")
def get_simulations(db: DbSession, limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    return list_simulations(db, limit=limit, offset=offset)


@router.get("/simulations/{simulation_id}")
def get_simulation(simulation_id: int, db: DbSession):
    try:
        return simulation_detail(db, simulation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Simulación no encontrada") from None
