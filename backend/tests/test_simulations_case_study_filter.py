"""Listado de simulaciones filtrado por caso de estudio (Fase 12.5)."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select, text

from app.db.models import CaseStudy, Simulation
from app.db.session import SessionLocal
from app.services.dashboard_service import list_simulations


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible")


def _insert_simulation(db, *, case_study_id: int | None, code: str | None) -> Simulation:
    params = {
        "scenarioId": "normal",
        "simulationParameters": {
            "caseStudy": {"caseStudyCode": code, "caseStudyName": code} if code else {},
        },
    }
    row = Simulation(
        scenario_name=f"Test {code or 'legacy'}",
        case_study_id=case_study_id,
        parameters_json=json.dumps(params, ensure_ascii=False),
    )
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def test_list_simulations_includes_case_study_metadata(db):
    study = db.scalar(select(CaseStudy).order_by(CaseStudy.id).limit(1))
    assert study is not None

    legacy = _insert_simulation(db, case_study_id=None, code=None)
    with_case = _insert_simulation(db, case_study_id=study.id, code=study.code)
    db.commit()

    try:
        payload = list_simulations(db, limit=50)
        by_id = {item["id"]: item for item in payload["items"]}
        assert by_id[legacy.id]["caseStudyId"] is None
        assert by_id[with_case.id]["caseStudyCode"] == study.code
    finally:
        db.delete(with_case)
        db.delete(legacy)
        db.commit()


def test_list_simulations_filter_legacy_only(db):
    study = db.scalar(select(CaseStudy).order_by(CaseStudy.id).limit(1))
    assert study is not None

    legacy = _insert_simulation(db, case_study_id=None, code=None)
    with_case = _insert_simulation(db, case_study_id=study.id, code=study.code)
    db.commit()

    try:
        payload = list_simulations(db, legacy_only=True, limit=50)
        ids = {item["id"] for item in payload["items"]}
        assert legacy.id in ids
        assert with_case.id not in ids
    finally:
        db.delete(with_case)
        db.delete(legacy)
        db.commit()


def test_list_simulations_filter_by_case_study_id(db):
    studies = db.scalars(select(CaseStudy).order_by(CaseStudy.id).limit(2)).all()
    assert len(studies) >= 2
    target_study, other_study = studies[0], studies[1]

    legacy = _insert_simulation(db, case_study_id=None, code=None)
    target = _insert_simulation(db, case_study_id=target_study.id, code=target_study.code)
    other = _insert_simulation(db, case_study_id=other_study.id, code=other_study.code)
    db.commit()

    try:
        payload = list_simulations(db, case_study_id=target_study.id, limit=50)
        ids = {item["id"] for item in payload["items"]}
        assert target.id in ids
        assert legacy.id not in ids
        assert other.id not in ids
    finally:
        db.delete(other)
        db.delete(target)
        db.delete(legacy)
        db.commit()
