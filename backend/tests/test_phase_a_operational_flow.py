"""Fase A — smoke checks y flujo operativo CE-UNARE-NORTE (integración real)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select, text

from app.db.models import User, UserRole
from app.db.session import SessionLocal
from tests.phase_a_support import (
    CASE_STUDY_CODE,
    assert_case_study_seed_ready,
    database_available,
    pick_operation_date,
    prepare_weekly_plan_ce_unare_norte,
    run_phase_a_operational_flow,
)
from app.services.planning_service import week_range

pytestmark = [
    pytest.mark.integration,
    pytest.mark.phase_a,
    pytest.mark.skipif(not database_available(), reason="PostgreSQL no disponible (just up && just seed)"),
]


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


@pytest.mark.phase_a
def test_phase_a_day0_seed_and_demo_users(db):
    """Día 0: caso CE-UNARE-NORTE, puntos CNT-001…015 y usuarios demo."""
    assert_case_study_seed_ready(db)

    emails = {
        row[0]
        for row in db.execute(
            text(
                "SELECT email FROM users WHERE email IN "
                "('plan@fero.com', 'conductor@fero.com', 'residente@fero.com')"
            )
        ).all()
    }
    assert emails == {"plan@fero.com", "conductor@fero.com", "residente@fero.com"}

    resident = db.scalar(select(User).where(User.email == "residente@fero.com"))
    assert resident is not None
    assert resident.role == UserRole.residente
    assert resident.sector_id is not None


@pytest.mark.phase_a
def test_phase_a_a1_weekly_draft_from_case_study(db):
    """A1: borrador semanal con 15 puntos del caso norte en 5 días laborables."""
    week_start, _ = week_range(date.today())
    weekly = prepare_weekly_plan_ce_unare_norte(db, week_start=week_start)

    assert weekly["status"] == "draft"
    assert weekly["caseStudyCode"] == CASE_STUDY_CODE
    assert len(weekly["days"]) == 5

    for day in weekly["days"]:
        assert len(day["collectionPointIds"]) == 15
        assert day["pointSource"] == "case_study"

    operation_date = pick_operation_date(week_start)
    day_for_today = next(
        (day for day in weekly["days"] if day["operationDate"] == operation_date.isoformat()),
        None,
    )
    assert day_for_today is not None
    assert len(day_for_today["collectionPointIds"]) == 15

    db.rollback()


@pytest.mark.phase_a
@pytest.mark.slow
def test_phase_a_full_operational_flow_ce_unare_norte(db):
    """A2–A4: validar → aprobar → optimizar día → despachar → conductor y residente."""
    result = run_phase_a_operational_flow(db)

    assert result["weeklyPlanId"] > 0
    assert result["dailyPlanId"] > 0
    assert result["validationJob"]["status"] == "completed"
    assert result["optimizationJob"]["status"] == "completed"
    assert result["dispatch"]["count"] >= 1
    assert result["operatorSnapshot"]["stopsTotal"] >= 1
    assert result["residentSchedule"]["hasWeeklyPlan"] is True
    assert result["residentSchedule"]["source"] == "weekly_plan"

    checklist = [
        ("Semana creada con CE-UNARE-NORTE", True),
        ("Validación ACO semanal", result["validationJob"]["status"] == "completed"),
        ("Semana aprobada", True),
        ("Día optimizado", result["optimizationJob"]["status"] == "completed"),
        ("Día despachado", result["operatorSnapshot"]["dailyPlanStatus"] == "dispatched"),
        ("Conductor ve ruta", result["operatorSnapshot"]["stopsTotal"] >= 1),
        ("Residente ve horario", result["residentSchedule"]["hasWeeklyPlan"]),
    ]
    for step, ok in checklist:
        assert ok, f"Paso fallido en bitácora: {step}"
