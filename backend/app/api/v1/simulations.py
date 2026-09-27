from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response

from app.api.deps import DbSession, OperationsStaff, OptionalUser, PlannerOrAdmin
from app.schemas.simulation import OptimizeJobCancelResponse, OptimizeJobCreated, OptimizeJobStatus, OptimizeRequest
from app.services.dashboard_service import (
    export_simulation_detail_file,
    get_kpis,
    list_scenarios,
    list_simulation_comparisons,
    list_simulations,
    normalize_scenario_id,
    simulation_detail,
    simulation_routes_feature_collection,
)
from app.services.optimization_job_service import (
    cancel_optimization_job,
    create_optimization_job,
    get_optimization_job_view,
    list_job_records,
)
from app.services.route_playback_service import build_simulation_route_playback

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
            aco_alpha=body.aco_alpha,
            aco_beta=body.aco_beta,
            aco_rho=body.aco_rho,
            pheromone_q=body.pheromone_q,
            priority_fill_level=body.priority_fill_level,
            time_window_enabled=body.time_window_enabled,
            departure_hour=body.departure_hour,
            kpi_view=body.kpi_view,
            workload_balance_weight=body.workload_balance_weight,
            makespan_weight=body.makespan_weight,
            min_active_vehicles=body.min_active_vehicles,
            max_route_hours_target=body.max_route_hours_target,
            seed=body.seed,
            collection_point_ids=body.collection_point_ids,
            case_study_id=body.case_study_id,
            auto_dispatch=body.auto_dispatch,
            operation_date=body.operation_date,
            daily_plan_id=body.daily_plan_id,
            weekly_plan_id=body.weekly_plan_id,
            planning_level=body.planning_level or "simulation",
        )
        return {"jobId": job.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/simulations/jobs")
def list_simulation_jobs(
    _: PlannerOrAdmin,
    job_type: str | None = Query(default=None, alias="jobType"),
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Historial persistente de jobs (simulaciones, planificación y contingencias)."""
    return list_job_records(job_type=job_type, status=status, limit=limit, offset=offset)


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
def get_simulations(
    db: DbSession,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    case_study_id: int | None = Query(default=None, alias="caseStudyId"),
    legacy_only: bool = Query(default=False, alias="legacyOnly"),
):
    return list_simulations(
        db,
        limit=limit,
        offset=offset,
        case_study_id=case_study_id,
        legacy_only=legacy_only,
    )


@router.get("/simulations/comparisons")
def get_simulation_comparisons(
    db: DbSession,
    _: PlannerOrAdmin,
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    scenario_id: str | None = Query(default=None, alias="scenarioId"),
    case_study_id: int | None = Query(default=None, alias="caseStudyId"),
    limit: int = Query(default=200, ge=1, le=500),
):
    return list_simulation_comparisons(
        db,
        from_date=from_date,
        to_date=to_date,
        scenario_id=scenario_id,
        case_study_id=case_study_id,
        limit=limit,
    )


@router.get("/simulations/{simulation_id}")
def get_simulation(simulation_id: int, db: DbSession):
    try:
        return simulation_detail(db, simulation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Simulación no encontrada") from None


@router.get("/simulations/{simulation_id}/routes.geojson")
def simulation_routes_geojson(simulation_id: int, db: DbSession, _: PlannerOrAdmin):
    try:
        payload = simulation_routes_feature_collection(db, simulation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Simulación no encontrada") from None
    import json

    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/geo+json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="feromap-simulacion-{simulation_id}-rutas.geojson"'
        },
    )


@router.get("/simulations/{simulation_id}/export")
def export_simulation(simulation_id: int, db: DbSession, _: PlannerOrAdmin, format: str = Query("csv", pattern="^(csv|pdf)$")):
    try:
        content, media_type, filename = export_simulation_detail_file(db, simulation_id, format)
    except LookupError:
        raise HTTPException(status_code=404, detail="Simulación no encontrada") from None
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/simulations/{simulation_id}/routes/playback")
def simulation_routes_playback(simulation_id: int, db: DbSession, _: PlannerOrAdmin):
    """Solo lectura: payload de playback para rutas optimizadas de una simulación."""
    return build_simulation_route_playback(db, simulation_id)
