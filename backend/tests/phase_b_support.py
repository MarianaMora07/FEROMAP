"""Utilidades compartidas para la Fase B — plan semanal desde frecuencias y verificación demo."""

from __future__ import annotations

from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, DailyPlan, OptimizedRoute, Sector, User, UserRole, WeeklyPlan
from app.services.planning_service import (
    approve_weekly_plan,
    autofill_weekly_plan_from_schedules,
    create_weekly_plan_draft,
    get_or_create_daily_plan,
    mark_daily_plan_dispatched,
    week_range,
)
from app.services.resident_proximity_service import build_resident_proximity
from app.services.resident_schedule_service import build_resident_schedule
from tests.phase_a_support import (
    _detach_daily_plans_from_weekly_days,
    optimize_daily_plan_via_job,
    pick_operation_date,
    validate_weekly_plan_via_job,
)
from app.services.operations_service import dispatch_optimized_routes

PHASE_B_ACO_ANTS = 6
PHASE_B_ACO_ITERATIONS = 10
UNARE_I_SECTOR_NAME = "Unare I"
EXPECTED_UNARE_I_WEEKDAYS = {0, 2, 4}  # lun / mié / vie


def phase_b_week_start(db: Session, *, preferred: date | None = None) -> date:
    """Semana libre para flujos B (evita FK con planes diarios de Fase A en la semana actual)."""
    anchor, _ = week_range(preferred or date.today())
    for offset_weeks in (1, 2, 0):
        candidate = anchor + timedelta(days=7 * offset_weeks)
        normalized, _ = week_range(candidate)
        existing = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == normalized))
        if existing is None:
            return normalized
        daily_refs = db.scalar(
            select(func.count())
            .select_from(DailyPlan)
            .where(DailyPlan.weekly_plan_id == existing.id)
        )
        if not daily_refs:
            return normalized
    return anchor + timedelta(days=7)


def unare_i_sector_id(db: Session) -> int:
    sector = db.scalar(select(Sector).where(Sector.name == UNARE_I_SECTOR_NAME))
    if sector is None:
        raise AssertionError(f"No existe el sector {UNARE_I_SECTOR_NAME}. Ejecuta: just seed")
    return sector.id


def unare_i_point_ids(db: Session) -> set[int]:
    sector_id = unare_i_sector_id(db)
    rows = db.scalars(
        select(CollectionPoint.id).where(
            CollectionPoint.sector_id == sector_id,
            CollectionPoint.deleted_at.is_(None),
            CollectionPoint.status == "active",
        )
    ).all()
    return set(rows)


def prepare_weekly_plan_from_schedules(db: Session, *, week_start: date) -> dict[str, Any]:
    """B1: borrador semanal sin caso de estudio — autofill desde visit_schedules."""
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
        existing.case_study_id = None
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
            case_study_id=None,
            days=[],
        )
        plan_id = created["id"]

    filled = autofill_weekly_plan_from_schedules(db, plan_id)
    workdays = [
        day
        for day in filled["days"]
        if date.fromisoformat(day["operationDate"]).weekday() < 5
    ]
    assert len(workdays) == 5, "Se esperaban 5 días laborables con puntos"
    for day in workdays:
        assert day["collectionPointIds"], f"Día {day['operationDate']} sin puntos"
    return filled


def _count_routes_for_daily_plan(db: Session, daily_plan_id: int) -> int:
    return len(
        list(
            db.scalars(
                select(OptimizedRoute).where(OptimizedRoute.daily_plan_id == daily_plan_id)
            ).all()
        )
    )


def pick_unare_i_operation_date(db: Session, weekly: dict[str, Any]) -> date:
    """Elige un día laborable con puntos de Unare I en el plan semanal."""
    unare_points = unare_i_point_ids(db)
    for day in weekly["days"]:
        operation_date = date.fromisoformat(day["operationDate"])
        if operation_date.weekday() >= 5:
            continue
        day_points = set(day["collectionPointIds"])
        if day_points & unare_points:
            return operation_date
    return pick_operation_date(date.fromisoformat(weekly["weekStartDate"]))


def optimize_all_weekdays(
    db: Session,
    *,
    week_start: date,
) -> dict[str, int]:
    """Optimiza lun–vie y devuelve conteo de rutas por fecha ISO."""
    route_counts: dict[str, int] = {}
    for offset in range(5):
        operation_date = week_start + timedelta(days=offset)
        daily_payload = get_or_create_daily_plan(db, operation_date)
        optimize_daily_plan_via_job(db, daily_payload["id"], operation_date)
        count = _count_routes_for_daily_plan(db, daily_payload["id"])
        assert count >= 1, f"Sin rutas para {operation_date.isoformat()}"
        route_counts[operation_date.isoformat()] = count
    return route_counts


def run_phase_b_operational_flow(db: Session) -> dict[str, Any]:
    """Flujo B: autofill frecuencias → aprobar → optimizar lun–vie → despachar → TR-01 + residente."""
    week_start = phase_b_week_start(db)
    weekly = prepare_weekly_plan_from_schedules(db, week_start=week_start)
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

    weekday_routes = optimize_all_weekdays(db, week_start=week_start)
    operation_date = pick_unare_i_operation_date(db, weekly)
    daily_payload = get_or_create_daily_plan(db, operation_date)
    daily_plan_id = daily_payload["id"]

    if _count_routes_for_daily_plan(db, daily_plan_id) < 1:
        optimize_daily_plan_via_job(db, daily_plan_id, operation_date)

    dispatch = dispatch_optimized_routes(db, daily_plan_id=daily_plan_id)
    mark_daily_plan_dispatched(db, daily_plan_id)
    db.commit()
    db.expire_all()
    assert dispatch["count"] >= 1, "No se despachó ninguna ruta"

    routes = list(
        db.scalars(
            select(OptimizedRoute)
            .options(joinedload(OptimizedRoute.vehicle))
            .where(OptimizedRoute.daily_plan_id == daily_plan_id)
        ).all()
    )
    tr01_routes = [route for route in routes if route.vehicle and route.vehicle.code == "TR-01"]
    assert tr01_routes, "TR-01 debe tener al menos una ruta tras optimizar"

    resident = db.scalar(
        select(User).where(User.email == "residente@fero.com", User.role == UserRole.residente)
    )
    assert resident is not None and resident.sector_id == unare_i_sector_id(db)

    reference = datetime.combine(operation_date, dt_time(8, 0), tzinfo=timezone.utc)
    schedule = build_resident_schedule(
        db, sector_id=resident.sector_id, reference=reference
    )
    assert schedule["hasWeeklyPlan"] is True
    assert schedule["source"] == "weekly_plan"
    assert schedule["calendar"], "El residente debe ver fechas concretas de recolección"
    calendar_weekdays = {item["weekday"] for item in schedule["calendar"]}
    assert calendar_weekdays & EXPECTED_UNARE_I_WEEKDAYS, (
        "Unare I debe tener días lun/mié/vie en el calendario del plan aprobado"
    )

    proximity = build_resident_proximity(db, resident)
    assert proximity["status"] in {"approaching", "in_sector", "completed"}, (
        f"Tras despacho se esperaba proximidad activa, obtuvo: {proximity['status']}"
    )
    assert proximity.get("vehicleCode"), "Debe mostrarse el vehículo en camino"

    return {
        "weekStart": week_start.isoformat(),
        "operationDate": operation_date.isoformat(),
        "weeklyPlanId": plan_id,
        "dailyPlanId": daily_plan_id,
        "weekdayRoutes": weekday_routes,
        "validationJob": validation,
        "dispatch": dispatch,
        "tr01RouteCount": len(tr01_routes),
        "residentSchedule": schedule,
        "residentProximity": proximity,
    }
