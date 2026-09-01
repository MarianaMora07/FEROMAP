"""Aislamiento de casos de estudio en el motor (Fase 12.3)."""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint, Simulation
from app.db.session import SessionLocal
from app.services.case_study_optimization import (
    prepare_case_study_engine_context,
    resolve_customer_demand,
)
from app.services.optimization_service import run_optimization_engine


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


def _membership_snapshot(db: Session, case_study_id: int, point_id: int) -> dict[str, object]:
    row = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == case_study_id,
            CaseStudyPoint.collection_point_id == point_id,
        )
    )
    assert row is not None
    return {
        "fill_level_kg_override": row.fill_level_kg_override,
        "demand_kg_override": row.demand_kg_override,
        "active_in_study": row.active_in_study,
    }


def _catalog_snapshot(db: Session, point_id: int) -> dict[str, object]:
    point = db.get(CollectionPoint, point_id)
    assert point is not None
    return {
        "current_fill_level_kg": point.current_fill_level_kg,
        "max_capacity_kg": point.max_capacity_kg,
        "status": point.status,
    }


def test_shared_point_has_distinct_demands_per_case_study(db: Session):
    """CNT-006 en Norte y Sur con overrides distintos → demandas distintas, mismas coords."""
    shared = db.scalar(select(CollectionPoint).where(CollectionPoint.code == "CNT-006"))
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    sur = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-SUR"))
    assert shared is not None and norte is not None and sur is not None

    norte_membership = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == norte.id,
            CaseStudyPoint.collection_point_id == shared.id,
        )
    )
    sur_membership = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == sur.id,
            CaseStudyPoint.collection_point_id == shared.id,
        )
    )
    assert norte_membership is not None and sur_membership is not None

    original_catalog = _catalog_snapshot(db, shared.id)
    lon, lat = float(shared.longitude), float(shared.latitude)

    try:
        norte_membership.fill_level_kg_override = Decimal("320")
        norte_membership.demand_kg_override = Decimal("320")
        sur_membership.fill_level_kg_override = Decimal("880")
        sur_membership.demand_kg_override = Decimal("880")
        db.flush()

        norte_ctx = prepare_case_study_engine_context(
            db, case_study_id=norte.id, collection_point_ids=[shared.id]
        )
        sur_ctx = prepare_case_study_engine_context(
            db, case_study_id=sur.id, collection_point_ids=[shared.id]
        )
        norte_demand, _ = resolve_customer_demand(
            shared,
            norte_ctx.memberships_by_point_id[shared.id],
            fill_boost=0.0,
        )
        sur_demand, _ = resolve_customer_demand(
            shared,
            sur_ctx.memberships_by_point_id[shared.id],
            fill_boost=0.0,
        )

        assert norte_demand != sur_demand
        assert float(shared.longitude) == lon
        assert float(shared.latitude) == lat
    finally:
        db.rollback()

    assert _catalog_snapshot(db, shared.id) == original_catalog


def test_running_case_study_does_not_mutate_other_case_or_catalog(db: Session):
    """Optimizar Caso Norte no altera collection_points ni membresías de Caso Sur."""
    shared = db.scalar(select(CollectionPoint).where(CollectionPoint.code == "CNT-006"))
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    sur = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-SUR"))
    assert shared is not None and norte is not None and sur is not None

    norte_membership = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == norte.id,
            CaseStudyPoint.collection_point_id == shared.id,
        )
    )
    sur_membership = db.scalar(
        select(CaseStudyPoint).where(
            CaseStudyPoint.case_study_id == sur.id,
            CaseStudyPoint.collection_point_id == shared.id,
        )
    )
    assert norte_membership is not None and sur_membership is not None

    original_catalog = _catalog_snapshot(db, shared.id)
    active_in_study = norte_membership.active_in_study

    try:
        norte_membership.fill_level_kg_override = Decimal("400")
        norte_membership.demand_kg_override = Decimal("400")
        sur_membership.fill_level_kg_override = Decimal("900")
        sur_membership.demand_kg_override = Decimal("900")
        db.flush()

        sur_before_run = _membership_snapshot(db, sur.id, shared.id)

        result = run_optimization_engine(
            db,
            scenario_id=None,
            case_study_id=norte.id,
            aco_ants=8,
            aco_iterations=10,
            auto_commit=True,
            auto_dispatch=False,
            reporter=None,
        )

        simulation = db.get(Simulation, result["simulationId"])
        assert simulation is not None
        assert simulation.case_study_id == norte.id
        assert result["caseStudyId"] == norte.id

        params = json.loads(simulation.parameters_json or "{}")
        case_payload = params["simulationParameters"]["caseStudy"]
        assert case_payload["caseStudyId"] == norte.id
        assert case_payload["caseStudyCode"] == "CE-UNARE-NORTE"
        assert isinstance(case_payload["caseStudyPointIds"], list)
        assert len(case_payload["caseStudyPointIds"]) == 15

        assert _catalog_snapshot(db, shared.id) == original_catalog
        assert _membership_snapshot(db, sur.id, shared.id) == sur_before_run
        assert _membership_snapshot(db, norte.id, shared.id) == {
            "fill_level_kg_override": Decimal("400"),
            "demand_kg_override": Decimal("400"),
            "active_in_study": active_in_study,
        }
    finally:
        db.rollback()


def test_driver_report_accepts_case_study_flag():
    from scripts.optimization_driver_plan_report import _parse_args

    with patch.object(sys, "argv", ["prog", "--case-study", "CE-UNARE-NORTE"]):
        parsed = _parse_args()
    assert parsed.case_study_code == "CE-UNARE-NORTE"
    assert parsed.scenario is None


def test_norte_and_sur_produce_distinct_evidence_for_shared_point(db: Session):
    """Mismo CNT-006 en dos casos → demandas distintas y evidencia de rutas separadas."""
    from app.services.case_study_evidence_service import run_case_study_evidence

    norte = run_case_study_evidence(db, "CE-UNARE-NORTE")
    sur = run_case_study_evidence(db, "CE-UNARE-SUR")

    assert norte.code != sur.code
    assert norte.simulation_id != sur.simulation_id
    assert norte.shared_point_demand_kg is not None
    assert sur.shared_point_demand_kg is not None
    assert norte.shared_point_demand_kg != sur.shared_point_demand_kg
    assert norte.point_count == 15
    assert sur.point_count == 15
    assert (
        norte.shared_point_route != sur.shared_point_route
        or norte.shared_point_sequence != sur.shared_point_sequence
        or norte.distance_km != sur.distance_km
    )


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session
