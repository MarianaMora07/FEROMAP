from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response

from app.api.deps import CurrentUser, DbSession, PlannerOrAdmin
from app.schemas.contingency import ContingencySimulationRequest
from app.schemas.route_constraints import DailyOptimizeRequest
from app.schemas.planning import (
    DailyPlanPointsUpdate,
    PendingCancelBulkRequest,
    PendingCancelRequest,
    PendingIncorporateRequest,
    DeferUncoveredRequest,
    WeeklyPlanApprove,
    WeeklyPlanCreate,
    WeeklyPlanUpdate,
)
from app.services.optimization_job_service import create_optimization_job, run_contingency_background
from app.services.operations_service import dispatch_optimized_routes
from app.services.planning_service import (
    approve_weekly_plan,
    archive_weekly_plan,
    autofill_weekly_plan_from_schedules,
    autofill_weekly_plan_from_case_study,
    bulk_cancel_pending_visits,
    cancel_pending_visit,
    close_daily_plan,
    compare_plan_versions,
    consolidate_daily_points,
    defer_uncovered_points_from_daily_plan,
    create_weekly_plan_draft,
    delete_weekly_plan,
    get_current_weekly_plan,
    get_daily_plan_by_date,
    get_daily_plan_execution_context,
    get_or_create_daily_plan,
    get_weekly_day_plan,
    get_weekly_plan,
    incorporate_pending_visit,
    list_operational_history,
    list_pending_visits,
    list_plan_versions,
    list_weekly_plans,
    mark_daily_plan_dispatched,
    open_daily_plan,
    preflight_weekly_feasibility,
    query_planning_history,
    resolve_pending_visit,
    trace_incident,
    update_daily_plan_points,
    update_weekly_plan,
    validate_weekly_plan_days,
)
from app.services.operator_service import operator_route_snapshot_or_403
from app.services.planning_analytics_service import (
    plan_vs_real_csv,
    plan_vs_real_report,
    planning_analytics_summary,
    planning_dashboard_snapshot,
)
from app.services.planning_reports_service import export_daily_plan_pdf, export_weekly_plan_pdf
from app.services.route_playback_service import build_daily_route_playback
from app.services.visit_schedule_service import list_active_visit_schedules

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/visit-schedules")
def list_visit_schedules(
    db: DbSession,
    _: PlannerOrAdmin,
    reference: date | None = None,
):
    return {"items": list_active_visit_schedules(db, reference=reference)}


@router.get("/weekly")
def list_weekly(
    db: DbSession,
    status: str | None = None,
    week_from: date | None = Query(default=None, alias="weekFrom"),
    week_to: date | None = Query(default=None, alias="weekTo"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return list_weekly_plans(db, status=status, week_from=week_from, week_to=week_to, limit=limit, offset=offset)


@router.get("/weekly/current")
def weekly_current(db: DbSession, reference: date | None = None):
    plan = get_current_weekly_plan(db, reference=reference)
    if plan is None:
        raise HTTPException(status_code=404, detail="No hay plan semanal aprobado para la semana actual")
    return plan


@router.post("/weekly")
def create_weekly(body: WeeklyPlanCreate, db: DbSession, _: PlannerOrAdmin):
    result = create_weekly_plan_draft(
        db,
        week_start_date=body.week_start_date,
        scenario_id=body.scenario_id,
        case_study_id=body.case_study_id,
        fleet_by_type=body.fleet_by_type,
        days=[
            {
                "operation_date": day.operation_date,
                "sector_ids": day.sector_ids,
                "collection_point_ids": day.collection_point_ids,
                "case_study_id": day.case_study_id,
                "expected_vehicle_count": day.expected_vehicle_count,
                "scenario_id_override": day.scenario_id_override,
            }
            for day in body.days
        ],
        notes=body.notes,
    )
    db.commit()
    return result


@router.get("/weekly/{plan_id}")
def get_weekly(plan_id: int, db: DbSession):
    return get_weekly_plan(db, plan_id)


@router.get("/weekly/{plan_id}/days/{operation_date}/plan")
def get_weekly_day_plan_view(plan_id: int, operation_date: date, db: DbSession):
    """Detalle de un día de la semana con los puntos a recorrer (Tarea 10, nivel 2)."""
    return get_weekly_day_plan(db, plan_id, operation_date)


@router.delete("/weekly/{plan_id}")
def delete_weekly(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    """Elimina un borrador de plan semanal (con sus días)."""
    result = delete_weekly_plan(db, plan_id)
    db.commit()
    return result


@router.patch("/weekly/{plan_id}")
def patch_weekly(plan_id: int, body: WeeklyPlanUpdate, db: DbSession, _: PlannerOrAdmin):
    update_kwargs: dict = {
        "days": [
            {
                "operation_date": day.operation_date,
                "sector_ids": day.sector_ids,
                "collection_point_ids": day.collection_point_ids,
                "case_study_id": day.case_study_id,
                "expected_vehicle_count": day.expected_vehicle_count,
                "scenario_id_override": day.scenario_id_override,
            }
            for day in body.days
        ]
        if body.days is not None
        else None,
        "scenario_id": body.scenario_id,
        "notes": body.notes,
    }
    if "fleet_by_type" in body.model_fields_set:
        update_kwargs["fleet_by_type"] = body.fleet_by_type
    if "case_study_id" in body.model_fields_set:
        update_kwargs["case_study_id"] = body.case_study_id
    result = update_weekly_plan(db, plan_id, **update_kwargs)
    db.commit()
    return result


@router.post("/weekly/{plan_id}/preflight")
def compute_weekly_preflight(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    """Recalcula el pre-flight heurístico (demanda vs. flota) de un plan en borrador.

    Permite mostrar viabilidad en el paso de configuración antes de validar; el
    resultado se persiste en ``preflight_json`` y se reutiliza al validar/aprobar.
    """
    from app.db.models import WeeklyPlan

    db_plan = db.get(WeeklyPlan, plan_id)
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Plan semanal no encontrado")
    payload = preflight_weekly_feasibility(db, db_plan)
    db.commit()
    return payload


@router.post("/weekly/{plan_id}/validate")
def validate_weekly(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    plan = get_weekly_plan(db, plan_id)
    point_ids: list[int] = []
    for day in plan["days"]:
        point_ids.extend(day["collectionPointIds"])
    point_ids = sorted(set(point_ids))
    if not point_ids:
        raise HTTPException(status_code=400, detail="El plan semanal no tiene puntos para validar")
    # Pre-flight heurístico por día (demanda vs flota) — Tarea 9
    from app.db.models import WeeklyPlan

    db_plan = db.get(WeeklyPlan, plan_id)
    if db_plan is not None:
        preflight_weekly_feasibility(db, db_plan)
        db.commit()
    # Validación por día con el motor ACO (corre en background, no bloquea el request).
    job = run_contingency_background(
        job_type="planning_validation",
        scenario_id=plan["scenarioId"],
        params={"weeklyPlanId": plan_id, "kind": "weekly_by_day"},
        runner=lambda _session: validate_weekly_plan_days(_session, plan_id=plan_id),
    )
    return {"jobId": job.id, "weeklyPlanId": plan_id}


@router.post("/weekly/{plan_id}/approve")
def approve_weekly(plan_id: int, body: WeeklyPlanApprove, db: DbSession, user: CurrentUser, _: PlannerOrAdmin):
    result = approve_weekly_plan(
        db,
        plan_id,
        reference_simulation_id=body.reference_simulation_id,
        expected_kpis=body.expected_kpis,
        allow_warnings=body.allow_warnings,
        user_id=user.id,
    )
    db.commit()
    return result


@router.post("/weekly/{plan_id}/generate-operational")
def generate_weekly_operational(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    from app.db.models import WeeklyPlan
    from app.services.optimization_job_service import start_weekly_operational_plan_job

    plan = db.get(WeeklyPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan semanal no encontrado")
    if plan.status not in ("draft", "approved"):
        raise HTTPException(
            status_code=400,
            detail="Solo se puede generar el plan operativo de un borrador o de una semana aprobada",
        )
    job = start_weekly_operational_plan_job(plan_id)
    return {"jobId": job.id, "weeklyPlanId": plan_id}


@router.post("/weekly/{plan_id}/notify-days")
def notify_weekly_days(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    from app.services.weekly_operational_service import notify_weekly_operational_days

    items = notify_weekly_operational_days(db, plan_id)
    db.commit()
    return {"items": items, "count": len(items)}


@router.post("/weekly/{plan_id}/autofill-from-schedules")
def autofill_weekly(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    result = autofill_weekly_plan_from_schedules(db, plan_id)
    db.commit()
    return result


@router.post("/weekly/{plan_id}/autofill-from-case-study")
def autofill_weekly_from_case_study(
    plan_id: int,
    db: DbSession,
    _: PlannerOrAdmin,
    case_study_id: int | None = Query(default=None, alias="caseStudyId"),
):
    result = autofill_weekly_plan_from_case_study(db, plan_id, case_study_id=case_study_id)
    db.commit()
    return result


@router.get("/weekly/{plan_id}/versions")
def weekly_versions(plan_id: int, db: DbSession):
    return {"items": list_plan_versions(db, entity_type="weekly_plan", entity_id=plan_id)}


@router.get("/weekly/{plan_id}/versions/compare")
def weekly_versions_compare(
    plan_id: int,
    db: DbSession,
    version_a: int = Query(alias="versionA"),
    version_b: int = Query(alias="versionB"),
):
    _ = plan_id
    return compare_plan_versions(db, version_a, version_b)


@router.get("/weekly/{plan_id}/export.pdf")
def export_weekly_pdf(plan_id: int, db: DbSession, _: PlannerOrAdmin):
    try:
        content = export_weekly_plan_pdf(db, plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="plan-semanal-{plan_id}.pdf"'},
    )


@router.get("/operational-history")
def operational_history(db: DbSession, limit: int = Query(default=25, ge=1, le=100)):
    return {"items": list_operational_history(db, limit=limit)}


@router.get("/daily")
def list_daily(db: DbSession, from_date: date | None = Query(default=None, alias="from"), to_date: date | None = Query(default=None, alias="to")):
    from sqlalchemy import select

    from app.db.models import DailyPlan

    stmt = select(DailyPlan).order_by(DailyPlan.operation_date.desc())
    if from_date is not None:
        stmt = stmt.where(DailyPlan.operation_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(DailyPlan.operation_date <= to_date)
    plans = db.scalars(stmt.limit(50)).all()
    return {
        "items": [
            {
                "id": plan.id,
                "operationDate": plan.operation_date.isoformat(),
                "status": plan.status,
                "scenarioId": plan.scenario_id,
                "simulationId": plan.simulation_id,
            }
            for plan in plans
        ]
    }


@router.get("/daily/{operation_date}")
def get_daily(operation_date: date, db: DbSession):
    """Solo lectura: no crea el plan del día (Tarea 9)."""
    return get_daily_plan_by_date(db, operation_date)


@router.post("/daily/{operation_date}/ensure")
def ensure_daily(operation_date: date, db: DbSession, _: PlannerOrAdmin):
    """Crea el plan del día si hace falta (explícito)."""
    result = get_or_create_daily_plan(db, operation_date)
    db.commit()
    return result


@router.post("/daily/{operation_date}/open")
def open_daily(operation_date: date, db: DbSession, _: PlannerOrAdmin):
    result = open_daily_plan(db, operation_date)
    db.commit()
    return result


@router.patch("/daily/{daily_plan_id}/points")
def patch_daily_points(daily_plan_id: int, body: DailyPlanPointsUpdate, db: DbSession, _: PlannerOrAdmin):
    result = update_daily_plan_points(db, daily_plan_id, body.final_point_ids)
    db.commit()
    return result


@router.post("/daily/{daily_plan_id}/optimize")
def optimize_daily(
    daily_plan_id: int,
    body: DailyOptimizeRequest,
    db: DbSession,
    _: PlannerOrAdmin,
):
    from app.db.models import DailyPlan

    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan del día no encontrado")
    point_ids = consolidate_daily_points(db, daily_plan_id)
    exec_ctx = get_daily_plan_execution_context(db, daily_plan_id)
    db.commit()
    job = create_optimization_job(
        scenario_id=exec_ctx["scenarioId"],
        collection_point_ids=point_ids,
        case_study_id=exec_ctx.get("caseStudyId"),
        operation_date=plan.operation_date,
        daily_plan_id=daily_plan_id,
        weekly_plan_id=plan.weekly_plan_id,
        planning_level="administrative",
        auto_dispatch=False,
        fleet_limit=exec_ctx.get("fleetLimit"),
        fleet_by_type=exec_ctx.get("fleetByType"),
        sector_partition=exec_ctx.get("sectorPartition"),
        priority_fill_level=body.priority_fill_level,
        time_window_enabled=body.time_window_enabled,
        departure_hour=body.departure_hour,
        kpi_view=body.kpi_view,
    )
    return {"jobId": job.id, "dailyPlanId": daily_plan_id, "pointCount": len(point_ids)}


@router.post("/daily/{daily_plan_id}/dispatch")
def dispatch_daily(daily_plan_id: int, db: DbSession, _: PlannerOrAdmin):
    from app.services.notification_service import notify_routes_dispatched

    result = dispatch_optimized_routes(db, daily_plan_id=daily_plan_id)
    mark_daily_plan_dispatched(db, daily_plan_id)
    result["notifications"] = notify_routes_dispatched(db, result.get("dispatchedRouteIds") or [])
    db.commit()
    return result


@router.post("/daily/{daily_plan_id}/simulate-contingency")
def simulate_contingency_daily(
    daily_plan_id: int,
    body: ContingencySimulationRequest,
    _: PlannerOrAdmin,
):
    """Simula una contingencia del día **sin despachar** (job asíncrono, dry-run).

    Devuelve un plan alternativo (antes/después) para revisar antes de comprometer
    las rutas reales; al confirmar, el front llama a los endpoints reales de
    ``/contingencies``.
    """
    from app.services.contingency_service import simulate_daily_contingency

    job = run_contingency_background(
        job_type="contingency_simulation",
        scenario_id="broken_vehicle" if body.type == "breakdown" else "saturated",
        params={
            "dailyPlanId": daily_plan_id,
            "type": body.type,
            "vehicleId": body.vehicle_id,
            "pointCode": body.point_code,
        },
        runner=lambda session: simulate_daily_contingency(
            session,
            daily_plan_id=daily_plan_id,
            contingency_type=body.type,
            vehicle_id=body.vehicle_id,
            collection_point_code=body.point_code,
        ),
    )
    return {"jobId": job.id, "jobType": job.job_type, "status": "pending"}


@router.post("/daily/{daily_plan_id}/defer-uncovered")
def defer_uncovered_daily(
    daily_plan_id: int,
    body: DeferUncoveredRequest,
    db: DbSession,
    _: PlannerOrAdmin,
):
    result = defer_uncovered_points_from_daily_plan(
        db,
        daily_plan_id,
        target_operation_date=body.target_operation_date,
    )
    db.commit()
    return result


@router.post("/daily/{daily_plan_id}/close")
def close_daily(daily_plan_id: int, db: DbSession, user: CurrentUser, _: PlannerOrAdmin):
    result = close_daily_plan(db, daily_plan_id, user_id=user.id)
    db.commit()
    return result


@router.get("/daily/{daily_plan_id}/routes/playback")
def daily_routes_playback(daily_plan_id: int, db: DbSession, _: PlannerOrAdmin):
    """Solo lectura: payload para animación de rutas planificadas (sin mutar BD)."""
    return build_daily_route_playback(db, daily_plan_id)


@router.get("/daily/{daily_plan_id}/export.pdf")
def export_daily_pdf(daily_plan_id: int, db: DbSession, _: PlannerOrAdmin):
    try:
        content = export_daily_plan_pdf(db, daily_plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="plan-diario-{daily_plan_id}.pdf"'},
    )


@router.get("/pending")
def list_pending(
    db: DbSession,
    status: str | None = Query(default="open"),
    target_date: date | None = None,
    origin_from: date | None = Query(default=None, alias="originFrom"),
    origin_to: date | None = Query(default=None, alias="originTo"),
):
    return {
        "items": list_pending_visits(
            db,
            status=status,
            target_date=target_date,
            origin_from=origin_from,
            origin_to=origin_to,
        )
    }


@router.post("/pending/cancel-bulk")
def cancel_pending_bulk(body: PendingCancelBulkRequest, db: DbSession, _: PlannerOrAdmin):
    result = bulk_cancel_pending_visits(
        db,
        pending_ids=body.pending_ids,
        older_than_days=body.older_than_days,
        target_date=body.target_date,
    )
    db.commit()
    return result


@router.post("/pending/{pending_id}/resolve")
def resolve_pending(pending_id: int, db: DbSession, _: PlannerOrAdmin):
    result = resolve_pending_visit(db, pending_id)
    db.commit()
    return result


@router.post("/pending/{pending_id}/cancel")
def cancel_pending(pending_id: int, body: PendingCancelRequest, db: DbSession, _: PlannerOrAdmin):
    result = cancel_pending_visit(db, pending_id, reason=body.reason)
    db.commit()
    return result


@router.post("/pending/{pending_id}/incorporate")
def incorporate_pending(pending_id: int, body: PendingIncorporateRequest, db: DbSession, _: PlannerOrAdmin):
    result = incorporate_pending_visit(db, pending_id, body.target_operation_date)
    db.commit()
    return result


@router.post("/weekly/{plan_id}/archive")
def archive_weekly(plan_id: int, db: DbSession, user: CurrentUser, _: PlannerOrAdmin):
    result = archive_weekly_plan(db, plan_id, user_id=user.id)
    db.commit()
    return result


@router.get("/analytics/summary")
def planning_analytics(
    db: DbSession,
    week_from: date | None = Query(default=None, alias="weekFrom"),
    week_to: date | None = Query(default=None, alias="weekTo"),
):
    return planning_analytics_summary(db, week_from=week_from, week_to=week_to)


@router.get("/analytics/plan-vs-real")
def planning_plan_vs_real(
    db: DbSession,
    _: PlannerOrAdmin,
    week_from: date | None = Query(default=None, alias="weekFrom"),
    week_to: date | None = Query(default=None, alias="weekTo"),
    limit: int = Query(default=60, ge=1, le=365),
):
    return plan_vs_real_report(db, week_from=week_from, week_to=week_to, limit=limit)


@router.get("/analytics/plan-vs-real.csv")
def planning_plan_vs_real_csv(
    db: DbSession,
    _: PlannerOrAdmin,
    week_from: date | None = Query(default=None, alias="weekFrom"),
    week_to: date | None = Query(default=None, alias="weekTo"),
):
    report = plan_vs_real_report(db, week_from=week_from, week_to=week_to, limit=365)
    return Response(
        content=plan_vs_real_csv(report["items"]),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="feromap-previsto-vs-real.csv"'
        },
    )


@router.get("/dashboard-snapshot")
def planning_snapshot(db: DbSession, reference: date | None = None):
    return planning_dashboard_snapshot(db, reference=reference)


@router.get("/operator-snapshot")
def operator_snapshot(
    db: DbSession,
    user: CurrentUser,
    operation_date: date | None = Query(default=None, alias="operationDate"),
):
    return operator_route_snapshot_or_403(db, user, operation_date=operation_date)


@router.get("/trace/incident/{incident_id}")
def incident_trace(incident_id: int, db: DbSession):
    return trace_incident(db, incident_id)


@router.get("/history")
def planning_history(
    db: DbSession,
    week_start: date | None = Query(default=None, alias="weekStart"),
    operation_date: date | None = Query(default=None, alias="operationDate"),
    incident_id: int | None = Query(default=None, alias="incidentId"),
    limit: int = Query(default=50, ge=1, le=100),
):
    return query_planning_history(
        db,
        week_start=week_start,
        operation_date=operation_date,
        incident_id=incident_id,
        limit=limit,
    )
