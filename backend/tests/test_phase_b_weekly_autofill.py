"""B1 — autofill semanal desde visit_schedules y visibilidad demo de casos."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import CaseStudy, PendingVisit
from app.db.session import SessionLocal
from app.services.case_study_service import is_case_study_demo_visible, list_case_studies
from app.services.planning_service import (
    autofill_weekly_plan_from_schedules,
    create_weekly_plan_draft,
    week_range,
)


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.phase_b,
    pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible"),
]


def _reference_monday() -> date:
    return date(2026, 3, 9)


def test_autofill_distributes_points_across_five_workdays(db: Session):
    week_start, _ = week_range(_reference_monday())
    created = create_weekly_plan_draft(
        db,
        week_start_date=week_start,
        scenario_id="normal",
        case_study_id=None,
        days=[],
    )
    db.flush()

    filled = autofill_weekly_plan_from_schedules(db, created["id"])
    workdays = [
        day
        for day in filled["days"]
        if date.fromisoformat(day["operationDate"]).weekday() < 5
    ]

    assert len(workdays) == 5, "Se esperaban 5 días laborables con puntos asignados"
    for day in workdays:
        assert day["collectionPointIds"], f"Día {day['operationDate']} sin puntos"

    total_slots = sum(len(day["collectionPointIds"]) for day in workdays)
    assert total_slots >= 120, f"Se esperaban al menos 120 asignaciones semanales, hay {total_slots}"

    unique_points = {
        point_id
        for day in workdays
        for point_id in day["collectionPointIds"]
    }
    assert len(unique_points) >= 110, "La mayoría de puntos activos deben aparecer en la semana"


def test_combinatorio_not_demo_visible(db: Session):
    combinatorio = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-COMBINATORIO"))
    assert combinatorio is not None
    assert is_case_study_demo_visible(combinatorio) is False

    demo_list = list_case_studies(db, demo_only=True, limit=100, offset=0)
    codes = {item["code"] for item in demo_list["items"]}
    assert "CE-COMBINATORIO" not in codes
    assert "CE-UNARE-NORTE" in codes
    assert demo_list["total"] == 3


def test_pending_visits_not_fabricated_by_seed(db: Session):
    """El seed limpio (b66477e) no fabrica pendientes: la tabla arranca vacía.

    Los pendientes se crean solo en flujos reales (no visitado, avería, defer);
    sembrarlos era actividad inventada.
    """
    pending = db.scalars(select(PendingVisit).order_by(PendingVisit.id)).all()
    assert pending == []


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()
