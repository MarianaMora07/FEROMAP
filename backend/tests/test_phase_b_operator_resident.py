"""B2 — chofer (/operator/plan) y residente Unare I (D9–D15)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import OptimizedRoute, User, UserRole, WeeklyPlan
from app.db.session import SessionLocal
from app.services.operator_service import operator_route_snapshot_or_403
from app.services.planning_service import week_range
from app.services.resident_schedule_service import build_resident_schedule
from tests.phase_a_support import (
    database_available,
    run_phase_a_operational_flow,
)


def _database_available() -> bool:
    return database_available()


pytestmark = [
    pytest.mark.integration,
    pytest.mark.phase_b,
    pytest.mark.slow,
    pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible"),
]


def test_tr01_has_route_after_operational_flow(db: Session):
    result = run_phase_a_operational_flow(db)
    operation_date = date.fromisoformat(result["operationDate"])

    routes = db.scalars(
        select(OptimizedRoute)
        .options(joinedload(OptimizedRoute.vehicle), joinedload(OptimizedRoute.daily_plan))
        .order_by(OptimizedRoute.id.desc())
    ).all()
    daily_routes = [
        route
        for route in routes
        if route.daily_plan is not None and route.daily_plan.operation_date == operation_date
    ]
    assert daily_routes, "Se esperaban rutas optimizadas para el día de operación"

    tr01_routes = [route for route in daily_routes if route.vehicle and route.vehicle.code == "TR-01"]
    assert tr01_routes, "TR-01 debe tener al menos una ruta tras optimizar"


def test_demo_conductor_sees_route_on_dispatched_day(db: Session):
    result = run_phase_a_operational_flow(db)
    operation_date = date.fromisoformat(result["operationDate"])

    conductor = db.scalar(
        select(User)
        .where(User.email == "conductor@fero.com", User.role == UserRole.conductor)
        .options(joinedload(User.driver_profile))
    )
    assert conductor is not None

    snapshot = operator_route_snapshot_or_403(
        db,
        conductor,
        operation_date=operation_date,
    )
    assert snapshot["stopsTotal"] >= 1
    assert snapshot["vehicleId"] is not None


def test_resident_schedule_empty_without_approved_weekly_plan(db: Session):
    resident = db.scalar(
        select(User).where(User.email == "residente@fero.com", User.role == UserRole.residente)
    )
    assert resident is not None and resident.sector_id is not None

    week_start, _ = week_range(date.today())
    approved = db.scalar(
        select(WeeklyPlan).where(
            WeeklyPlan.week_start_date == week_start,
            WeeklyPlan.status == "approved",
        )
    )
    if approved is not None:
        pytest.skip("Semana actual ya tiene plan aprobado (ejecuta just seed para estado limpio)")

    schedule = build_resident_schedule(db, sector_id=resident.sector_id)
    assert schedule["hasWeeklyPlan"] is False
    assert schedule["hasSchedule"] is False
    assert schedule["isCollectionDay"] is False
    assert schedule["source"] == "none"


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()
