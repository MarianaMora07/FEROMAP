"""Utilidades compartidas para la Fase A — flujo operativo CE-UNARE-NORTE."""

from __future__ import annotations

from datetime import date, datetime, timedelta, time as dt_time, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from app.db.models import CaseStudy, CollectionPoint, DailyPlan, User, UserRole, WeeklyPlan
from app.db.session import SessionLocal
from app.services.case_study_planning import resolve_case_study_active_point_ids
from app.services.optimization_service import run_optimization_engine
from app.services.operations_service import dispatch_optimized_routes
from app.services.operator_service import operator_route_snapshot_or_403
from app.services.planning_service import (
    approve_weekly_plan,
    autofill_weekly_plan_from_case_study,
    create_weekly_plan_draft,
    get_or_create_daily_plan,
    mark_daily_plan_dispatched,
    week_range,
)
from app.services.resident_schedule_service import build_resident_schedule

CASE_STUDY_CODE = "CE-UNARE-NORTE"
EXPECTED_POINT_CODES = tuple(f"CNT-{index:03d}" for index in range(1, 16))
PHASE_A_ACO_ANTS = 8
PHASE_A_ACO_ITERATIONS = 12


def database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def get_case_study_norte(db: Session) -> CaseStudy:
    case = db.scalar(select(CaseStudy).where(CaseStudy.code == CASE_STUDY_CODE))
    if case is None:
        raise AssertionError(f"No existe el caso de estudio {CASE_STUDY_CODE}. Ejecuta: just seed")
    return case


def assert_case_study_seed_ready(db: Session) -> list[int]:
    case = get_case_study_norte(db)
    point_ids = resolve_case_study_active_point_ids(db, case.id)
    assert len(point_ids) == 15, f"Se esperaban 15 puntos en {CASE_STUDY_CODE}, hay {len(point_ids)}"

    codes = db.scalars(
        select(CollectionPoint.code)
        .where(CollectionPoint.id.in_(point_ids))
        .order_by(CollectionPoint.code)
    ).all()
    assert list(codes) == list(EXPECTED_POINT_CODES)
    return point_ids


def pick_operation_date(week_start: date) -> date:
    """Elige un día laborable de la semana del plan (preferencia: hoy si cae en lun–vie)."""
    today = date.today()
    week_end = week_start + timedelta(days=6)
    if week_start <= today <= week_end and today.weekday() < 5:
        return today
    return week_start


def _detach_daily_plans_from_weekly_days(db: Session, weekly_plan_id: int) -> None:
    """Evita FK al reemplazar días del plan semanal en tests de integración."""
    daily_plans = db.scalars(
        select(DailyPlan).where(DailyPlan.weekly_plan_id == weekly_plan_id)
    ).all()
    for daily_plan in daily_plans:
        daily_plan.weekly_plan_day_id = None
    if daily_plans:
        db.flush()


def prepare_weekly_plan_ce_unare_norte(db: Session, *, week_start: date) -> dict[str, Any]:
    """Reconfigura la semana con CE-UNARE-NORTE (reutiliza fila si ya existe)."""
    case = get_case_study_norte(db)
    normalized_start, _ = week_range(week_start)

    existing = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.week_start_date == normalized_start)
        .options(joinedload(WeeklyPlan.days))
    )
    if existing is not None:
        existing.status = "draft"
        existing.approved_at = None
        existing.approved_by_user_id = None
        existing.reference_simulation_id = None
        existing.expected_kpis_json = None
        existing.case_study_id = case.id
        existing.scenario_id = "normal"
        _detach_daily_plans_from_weekly_days(db, existing.id)
        for day in list(existing.days):
            db.delete(day)
        db.flush()
        plan_id = existing.id
    else:
        created = create_weekly_plan_draft(
            db,
            week_start_date=normalized_start,
            scenario_id="normal",
            case_study_id=case.id,
            days=[],
        )
        plan_id = created["id"]

    filled = autofill_weekly_plan_from_case_study(db, plan_id, case_study_id=case.id)
    assert filled["caseStudyCode"] == CASE_STUDY_CODE
    assert len(filled["days"]) == 5
    for day in filled["days"]:
        assert day["pointSource"] == "case_study"
        assert len(day["collectionPointIds"]) == 15
    return filled


def validate_weekly_plan_via_job(db: Session, plan_id: int) -> dict[str, Any]:
    from app.services.planning_service import get_weekly_plan

    plan = get_weekly_plan(db, plan_id)
    point_ids: list[int] = []
    for day in plan["days"]:
        point_ids.extend(day["collectionPointIds"])
    point_ids = sorted(set(point_ids))
    assert point_ids, "El plan semanal no tiene puntos para validar"

    result = run_optimization_engine(
        db,
        plan["scenarioId"],
        collection_point_ids=point_ids,
        case_study_id=plan.get("caseStudyId"),
        weekly_plan_id=plan_id,
        planning_level="strategic",
        auto_dispatch=False,
        aco_ants=PHASE_A_ACO_ANTS,
        aco_iterations=PHASE_A_ACO_ITERATIONS,
    )
    db.commit()
    db.expire_all()
    return {"status": "completed", "result": result}


def optimize_daily_plan_via_job(db: Session, daily_plan_id: int, operation_date: date) -> dict[str, Any]:
    from app.db.models import DailyPlan
    from app.services.planning_service import consolidate_daily_points, get_daily_plan_execution_context

    plan = db.get(DailyPlan, daily_plan_id)
    assert plan is not None, "Plan del día no encontrado"
    point_ids = consolidate_daily_points(db, daily_plan_id)
    assert point_ids, "El día no tiene puntos programados"
    exec_ctx = get_daily_plan_execution_context(db, daily_plan_id)

    result = run_optimization_engine(
        db,
        exec_ctx["scenarioId"],
        collection_point_ids=point_ids,
        case_study_id=exec_ctx.get("caseStudyId"),
        operation_date=operation_date,
        daily_plan_id=daily_plan_id,
        weekly_plan_id=plan.weekly_plan_id,
        planning_level="administrative",
        auto_dispatch=False,
        fleet_limit=exec_ctx.get("fleetLimit"),
        aco_ants=PHASE_A_ACO_ANTS,
        aco_iterations=PHASE_A_ACO_ITERATIONS,
    )
    db.commit()
    db.expire_all()
    return {"status": "completed", "result": result}


def run_phase_a_operational_flow(db: Session) -> dict[str, Any]:
    """Ejecuta el ciclo completo Fase A y devuelve artefactos para aserciones."""
    assert_case_study_seed_ready(db)

    week_start, _ = week_range(date.today())
    operation_date = pick_operation_date(week_start)

    weekly = prepare_weekly_plan_ce_unare_norte(db, week_start=week_start)
    plan_id = weekly["id"]
    db.commit()

    validation = validate_weekly_plan_via_job(db, plan_id)
    simulation_id = validation["result"]["simulationId"]
    approved = approve_weekly_plan(
        db,
        plan_id,
        reference_simulation_id=simulation_id,
        expected_kpis=validation["result"].get("kpis"),
    )
    assert approved["status"] == "approved"
    db.commit()

    daily_payload = get_or_create_daily_plan(db, operation_date)
    daily_plan_id = daily_payload["id"]

    optimization = optimize_daily_plan_via_job(db, daily_plan_id, operation_date)
    dispatch = dispatch_optimized_routes(db, daily_plan_id=daily_plan_id)
    mark_daily_plan_dispatched(db, daily_plan_id)
    db.commit()
    db.expire_all()
    assert dispatch["count"] >= 1, "No se despachó ninguna ruta"

    from app.db.models import DailyPlan, Driver, OptimizedRoute

    daily = db.get(DailyPlan, daily_plan_id)
    assert daily is not None
    assert daily.status == "dispatched"

    routes = list(
        db.scalars(
            select(OptimizedRoute).where(OptimizedRoute.daily_plan_id == daily_plan_id)
        ).all()
    )
    assert routes, "No hay rutas optimizadas para el día"

    conductor = db.scalar(
        select(User)
        .where(User.email == "conductor@fero.com", User.role == UserRole.conductor)
        .options(joinedload(User.driver_profile))
    )
    assert conductor is not None

    operator_snapshot = operator_route_snapshot_or_403(
        db,
        conductor,
        operation_date=operation_date,
    )
    if operator_snapshot["stopsTotal"] < 1:
        assigned_driver_id = next(
            (route.driver_id for route in routes if route.driver_id is not None),
            None,
        )
        assert assigned_driver_id is not None, "Las rutas no tienen conductor asignado"
        driver = db.get(Driver, assigned_driver_id)
        assert driver is not None
        driver_user = db.get(User, driver.user_id)
        assert driver_user is not None
        operator_snapshot = operator_route_snapshot_or_403(
            db,
            driver_user,
            operation_date=operation_date,
        )

    assert operator_snapshot["dailyPlanStatus"] == "dispatched"
    assert operator_snapshot["stopsTotal"] >= 1
    stop_codes = {stop["code"] for stop in operator_snapshot["stops"] if stop.get("code")}
    assert stop_codes & set(EXPECTED_POINT_CODES), "El conductor no tiene paradas del caso norte"

    resident = db.scalar(
        select(User).where(User.email == "residente@fero.com", User.role == UserRole.residente)
    )
    assert resident is not None and resident.sector_id is not None
    reference = datetime.combine(operation_date, dt_time(8, 0), tzinfo=timezone.utc)
    schedule = build_resident_schedule(db, sector_id=resident.sector_id, reference=reference)
    assert schedule["hasWeeklyPlan"] is True
    assert schedule["source"] == "weekly_plan"
    assert operation_date.isoformat() in {item["date"] for item in schedule["calendar"]}

    return {
        "weekStart": week_start.isoformat(),
        "operationDate": operation_date.isoformat(),
        "weeklyPlanId": plan_id,
        "dailyPlanId": daily_plan_id,
        "validationJob": validation,
        "optimizationJob": optimization,
        "dispatch": dispatch,
        "operatorSnapshot": operator_snapshot,
        "residentSchedule": schedule,
    }
