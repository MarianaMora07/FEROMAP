"""B6 — verificación automática Fase B (extiende Fase A, D25)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from tests.phase_a_support import database_available, validate_weekly_plan_via_job
from tests.phase_b_support import (
    EXPECTED_UNARE_I_WEEKDAYS,
    optimize_all_weekdays,
    phase_b_week_start,
    prepare_weekly_plan_from_schedules,
    run_phase_b_operational_flow,
)
from app.services.planning_service import approve_weekly_plan, week_range


pytestmark = [
    pytest.mark.integration,
    pytest.mark.phase_b,
    pytest.mark.skipif(not database_available(), reason="PostgreSQL no disponible (just up && just seed)"),
]


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()


@pytest.mark.phase_b
def test_phase_b_autofill_five_workdays_no_empty_days(db: Session):
    """Autofill semanal: 5 días laborables sin huecos."""
    week_start, _ = week_range(date.today())
    weekly = prepare_weekly_plan_from_schedules(db, week_start=week_start)
    workdays = [day for day in weekly["days"] if len(day["collectionPointIds"]) > 0]
    assert len(workdays) == 5
    for day in workdays:
        assert day["collectionPointIds"]


@pytest.mark.phase_b
@pytest.mark.slow
def test_phase_b_each_weekday_produces_routes(db: Session):
    """Optimizar lun–vie: cada día laborable produce ≥1 ruta."""
    week_start = phase_b_week_start(db)
    weekly = prepare_weekly_plan_from_schedules(db, week_start=week_start)
    db.commit()

    validation = validate_weekly_plan_via_job(db, weekly["id"])
    approve_weekly_plan(
        db,
        weekly["id"],
        reference_simulation_id=validation["result"]["simulationId"],
        expected_kpis=validation["result"].get("kpis"),
    )
    db.commit()

    route_counts = optimize_all_weekdays(db, week_start=week_start)
    assert len(route_counts) == 5
    assert all(count >= 1 for count in route_counts.values())


@pytest.mark.phase_b
@pytest.mark.slow
def test_phase_b_full_verify_flow(db: Session):
    """TR-01, residente Unare I (días + proximidad) tras flujo B completo."""
    result = run_phase_b_operational_flow(db)

    assert result["tr01RouteCount"] >= 1
    assert len(result["weekdayRoutes"]) == 5
    assert all(count >= 1 for count in result["weekdayRoutes"].values())

    schedule = result["residentSchedule"]
    assert schedule["hasWeeklyPlan"] is True
    calendar_weekdays = {item["weekday"] for item in schedule["calendar"]}
    assert calendar_weekdays & EXPECTED_UNARE_I_WEEKDAYS

    proximity = result["residentProximity"]
    assert proximity["status"] in {"approaching", "in_sector", "completed"}
    assert proximity.get("vehicleCode")
