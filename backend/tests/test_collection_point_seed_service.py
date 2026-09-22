"""Cobertura automática de collection points por sector."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.models import CollectionPoint, Parish, Sector
from app.db.session import SessionLocal
from app.services.collection_point_seed_service import (
    TARGET_COLLECTION_POINTS,
    ensure_collection_points_coverage,
    generate_missing_collection_points,
)


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible")


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()


def _db_has_seed_demo(db: Session) -> bool:
    """True si la BD global ya trae el catálogo demo (≈300 collection points)."""
    total = db.scalar(
        select(func.count()).select_from(CollectionPoint).where(CollectionPoint.deleted_at.is_(None))
    )
    return (total or 0) >= 100


# Estos tests asumen BD sin seed: crean códigos CNT-0xx y cuentan puntos globales.
# En la BD sembrada (catálogo demo completo) chocan por UniqueViolation / totales
# desplazados, así que solo corren en el paso unit de CI/BD limpia; si la BD ya está
# sembrada se saltan.
def _skip_if_seeded(db: Session) -> None:
    if _db_has_seed_demo(db):
        pytest.skip("Requiere BD sin seed: corre en el paso unit de CI/BD limpia")


def _seed_minimal_sectors(db: Session, count: int) -> list[Sector]:
    parish = Parish(name="Test Parish", city="Ciudad Guayana")
    db.add(parish)
    db.flush()
    sectors: list[Sector] = []
    for index in range(count):
        sector = Sector(parish_id=parish.id, name=f"Sector {index:02d}")
        db.add(sector)
        sectors.append(sector)
    db.flush()
    return sectors


def test_ensure_coverage_creates_one_point_per_empty_sector(db: Session):
    _skip_if_seeded(db)
    sectors = _seed_minimal_sectors(db, 3)
    db.add(
        CollectionPoint(
            sector_id=sectors[0].id,
            code="CNT-001",
            latitude=Decimal("8.2784"),
            longitude=Decimal("-62.7516"),
            max_capacity_kg=Decimal("1000"),
            current_fill_level_kg=Decimal("0"),
            status="active",
        )
    )
    db.flush()

    result = ensure_collection_points_coverage(db, target_total=3)

    assert result["created"] == 2
    assert result["total_points"] == 3
    assert result["sectors_covered"] == 3


def test_ensure_coverage_reaches_target_total(db: Session):
    _skip_if_seeded(db)
    sectors = _seed_minimal_sectors(db, 4)
    for index, sector in enumerate(sectors[:2]):
        db.add(
            CollectionPoint(
                sector_id=sector.id,
                code=f"CNT-{index + 1:03d}",
                latitude=Decimal("8.2784"),
                longitude=Decimal("-62.7516"),
                max_capacity_kg=Decimal("1000"),
                current_fill_level_kg=Decimal("0"),
                status="active",
            )
        )
    db.flush()

    result = ensure_collection_points_coverage(db, target_total=6)

    assert result["created"] == 4
    assert result["total_points"] == 6
    assert result["sectors_covered"] == 4


def test_generate_missing_collection_points_is_idempotent_after_seed(db: Session):
    _skip_if_seeded(db)
    _seed_minimal_sectors(db, 5)
    ensure_collection_points_coverage(db)
    db.flush()

    second_pass = generate_missing_collection_points(db)

    assert second_pass["created"] == 0
    assert second_pass["total_points"] == TARGET_COLLECTION_POINTS


@pytest.mark.integration
def test_seeded_database_reaches_catalog_target_across_all_sectors(db: Session):
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

    assert total == TARGET_COLLECTION_POINTS
    assert sectors_with_points == sectors_total
