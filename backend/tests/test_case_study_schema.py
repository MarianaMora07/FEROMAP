"""Integridad FK y seed de casos de estudio (Fase 12.1)."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint, Sector, Simulation
from app.db.session import SessionLocal


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible")


def test_case_study_tables_exist(db: Session):
    assert db.scalar(text("SELECT to_regclass('public.case_studies') IS NOT NULL"))
    assert db.scalar(text("SELECT to_regclass('public.case_study_points') IS NOT NULL"))
    assert db.scalar(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.columns"
            "  WHERE table_name = 'simulations' AND column_name = 'case_study_id'"
            ")"
        )
    )


def test_seed_loads_four_case_studies(db: Session):
    count = db.scalar(select(func.count()).select_from(CaseStudy))
    assert count == 4
    codes = db.scalars(select(CaseStudy.code).order_by(CaseStudy.code)).all()
    assert codes == ["CE-COMBINATORIO", "CE-MULTI-VIAJE", "CE-UNARE-NORTE", "CE-UNARE-SUR"]


def test_case_study_point_counts(db: Session):
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    sur = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-SUR"))
    multi = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-MULTI-VIAJE"))
    combinatorio = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-COMBINATORIO"))
    assert norte is not None and sur is not None and multi is not None and combinatorio is not None

    norte_count = db.scalar(
        select(func.count())
        .select_from(CaseStudyPoint)
        .where(CaseStudyPoint.case_study_id == norte.id, CaseStudyPoint.active_in_study.is_(True))
    )
    sur_count = db.scalar(
        select(func.count())
        .select_from(CaseStudyPoint)
        .where(CaseStudyPoint.case_study_id == sur.id, CaseStudyPoint.active_in_study.is_(True))
    )
    multi_count = db.scalar(
        select(func.count())
        .select_from(CaseStudyPoint)
        .where(CaseStudyPoint.case_study_id == multi.id, CaseStudyPoint.active_in_study.is_(True))
    )
    combinatorio_count = db.scalar(
        select(func.count())
        .select_from(CaseStudyPoint)
        .where(CaseStudyPoint.case_study_id == combinatorio.id, CaseStudyPoint.active_in_study.is_(True))
    )
    assert norte_count == 15
    assert sur_count == 15
    assert multi_count == 12
    assert combinatorio_count == 120


def test_collection_points_seed_covers_all_sectors(db: Session):
    total = db.scalar(
        select(func.count()).select_from(CollectionPoint).where(CollectionPoint.deleted_at.is_(None))
    )
    sectors_total = db.scalar(
        select(func.count()).select_from(Sector).where(Sector.deleted_at.is_(None))
    )
    sectors_with_points = db.scalar(
        select(func.count(func.distinct(CollectionPoint.sector_id))).where(
            CollectionPoint.deleted_at.is_(None)
        )
    )
    assert total == 120
    assert sectors_with_points == sectors_total


def test_collection_points_seed_has_stress_grid(db: Session):
    original_codes = {f"CNT-{index:03d}" for index in range(1, 81)}
    loaded_codes = set(
        db.scalars(
            select(CollectionPoint.code).where(CollectionPoint.deleted_at.is_(None))
        ).all()
    )
    assert original_codes.issubset(loaded_codes)
    assert db.scalar(select(CollectionPoint.code).where(CollectionPoint.code == "CNT-080")) == "CNT-080"


def test_shared_point_in_multiple_case_studies(db: Session):
    """M:N: CNT-006 en Norte, Sur y CE-COMBINATORIO (catálogo completo)."""
    point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == "CNT-006"))
    assert point is not None
    memberships = db.scalars(
        select(CaseStudyPoint.case_study_id).where(CaseStudyPoint.collection_point_id == point.id)
    ).all()
    assert len(memberships) == 3


def test_multi_viaje_has_demand_overrides(db: Session):
    study = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-MULTI-VIAJE"))
    assert study is not None
    with_override = db.scalar(
        select(func.count())
        .select_from(CaseStudyPoint)
        .where(
            CaseStudyPoint.case_study_id == study.id,
            CaseStudyPoint.demand_kg_override.is_not(None),
        )
    )
    assert with_override == 12


def test_fk_rejects_invalid_collection_point(db: Session):
    study = db.scalar(select(CaseStudy).limit(1))
    assert study is not None
    db.add(
        CaseStudyPoint(
            case_study_id=study.id,
            collection_point_id=999_999,
            active_in_study=True,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_fk_rejects_invalid_case_study_on_simulation(db: Session):
    db.add(
        Simulation(
            scenario_name="FK test",
            case_study_id=999_999,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_unique_case_study_code(db: Session):
    db.add(
        CaseStudy(
            code="CE-UNARE-NORTE",
            name="Duplicado",
            default_scenario_id="normal",
            status="draft",
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_cascade_delete_case_study_removes_memberships(db: Session):
    study = CaseStudy(
        code="CE-TEST-CASCADE",
        name="Temporal",
        default_scenario_id="normal",
        status="draft",
    )
    db.add(study)
    db.flush()

    point = db.scalar(select(CollectionPoint).limit(1))
    assert point is not None
    db.add(
        CaseStudyPoint(
            case_study_id=study.id,
            collection_point_id=point.id,
            active_in_study=True,
        )
    )
    db.flush()

    membership_id = (study.id, point.id)
    db.delete(study)
    db.flush()

    remaining = db.get(CaseStudyPoint, membership_id)
    assert remaining is None
    db.rollback()


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session
