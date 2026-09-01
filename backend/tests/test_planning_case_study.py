"""Puente planificación semanal ↔ casos de estudio (Fase 12.6)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import CaseStudy, WeeklyPlan
from app.db.session import SessionLocal
from app.services.case_study_planning import resolve_case_study_active_point_ids, resolve_weekly_day_point_ids
from app.services.planning_service import (
    approve_weekly_plan,
    autofill_weekly_plan_from_case_study,
    create_weekly_plan_draft,
    get_weekly_plan,
    resolve_scheduled_point_ids,
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
    pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible"),
]


def _unique_week_start(reference: date = date(2030, 1, 7)) -> date:
    return reference


def test_weekly_plan_resolves_points_from_case_study(db: Session):
    case = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    assert case is not None
    expected_ids = resolve_case_study_active_point_ids(db, case.id)
    assert len(expected_ids) == 15

    week_start, _ = week_range(_unique_week_start())
    plan_payload = create_weekly_plan_draft(
        db,
        week_start_date=week_start,
        scenario_id="normal",
        case_study_id=case.id,
        days=[],
    )
    db.flush()

    filled = autofill_weekly_plan_from_case_study(db, plan_payload["id"], case_study_id=case.id)
    assert filled["caseStudyId"] == case.id
    assert filled["caseStudyCode"] == "CE-UNARE-NORTE"
    assert len(filled["days"]) == 5
    for day in filled["days"]:
        assert day["pointSource"] == "case_study"
        assert day["collectionPointIds"] == expected_ids

    approve_weekly_plan(db, plan_payload["id"])
    db.flush()

    monday = week_start
    resolved = resolve_scheduled_point_ids(db, monday)
    assert resolved == expected_ids


def test_weekly_plan_case_study_columns_exist(db: Session):
    assert db.scalar(text("SELECT to_regclass('public.weekly_plans') IS NOT NULL"))
    assert db.scalar(
        text(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'weekly_plans' AND column_name = 'case_study_id'"
            ")"
        )
    )
    assert db.scalar(
        text(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'weekly_plan_days' AND column_name = 'case_study_id'"
            ")"
        )
    )


def test_get_weekly_plan_payload_includes_case_metadata(db: Session):
    case = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-MULTI-VIAJE"))
    assert case is not None
    week_start, _ = week_range(date(2030, 2, 4))
    existing = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == week_start))
    if existing is not None:
        db.delete(existing)
        db.flush()

    created = create_weekly_plan_draft(
        db,
        week_start_date=week_start,
        scenario_id="normal",
        case_study_id=case.id,
        days=[],
    )
    autofill_weekly_plan_from_case_study(db, created["id"])
    payload = get_weekly_plan(db, created["id"])
    assert payload["caseStudyId"] == case.id
    assert payload["caseStudyCode"] == "CE-MULTI-VIAJE"
    assert payload["days"][0]["pointSource"] == "case_study"


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()
