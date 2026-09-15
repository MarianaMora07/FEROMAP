"""Tests del servicio de sectores (factor de velocidad y tasa de generación)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.schemas.sector import SectorGenerationRateUpdate
from app.services.sector_service import (
    distribute_sector_generation_rate,
    effective_zone_rate_kg_per_day,
    list_sectors_with_fill_rate,
    sectors_summary,
    update_sector_fill_rate_factor,
    update_sector_generation_config,
    update_sector_generation_rate,
)


def _sector(**overrides):
    base = dict(
        id=1,
        name="Unare I",
        fill_rate_factor=Decimal("1.0"),
        generation_rate_kg_per_day=None,
        per_capita_kg_per_day=None,
        population=None,
        distribution_mode="equal",
        deleted_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_list_sectors_with_fill_rate_serializes():
    db = MagicMock()
    db.scalars.return_value.all.return_value = [
        _sector(fill_rate_factor=Decimal("1.5"), generation_rate_kg_per_day=Decimal("600.00")),
    ]

    assert list_sectors_with_fill_rate(db) == [
        {
            "id": 1,
            "name": "Unare I",
            "fillRateFactor": 1.5,
            "population": None,
            "perCapitaKgPerDay": None,
            "distributionMode": "equal",
            "configuredGenerationRateKgPerDay": 600.0,
            "generationRateKgPerDay": 600.0,
        }
    ]


def test_update_sector_fill_rate_factor_persists():
    db = MagicMock()
    sector = SimpleNamespace(
        id=3, name="Villa Betania", fill_rate_factor=Decimal("1.0"), deleted_at=None
    )
    db.get.return_value = sector

    result = update_sector_fill_rate_factor(db, 3, 1.75)

    assert result["fillRateFactor"] == 1.75
    assert sector.fill_rate_factor == Decimal("1.75")
    db.commit.assert_called_once()


def test_update_sector_fill_rate_factor_missing_raises():
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as exc:
        update_sector_fill_rate_factor(db, 99, 1.5)

    assert exc.value.status_code == 404


def test_distribute_sector_generation_rate_splits_equally():
    db = MagicMock()
    points = [
        SimpleNamespace(generation_rate_kg_per_day=None),
        SimpleNamespace(generation_rate_kg_per_day=None),
        SimpleNamespace(generation_rate_kg_per_day=None),
    ]
    db.scalars.return_value.all.return_value = points
    sector = SimpleNamespace(id=5, generation_rate_kg_per_day=Decimal("300.00"))

    updated = distribute_sector_generation_rate(db, sector)

    assert updated == 3
    assert all(point.generation_rate_kg_per_day == Decimal("100.00") for point in points)


def test_distribute_sector_generation_rate_skips_when_unset():
    db = MagicMock()
    sector = SimpleNamespace(id=5, generation_rate_kg_per_day=None)

    assert distribute_sector_generation_rate(db, sector) == 0
    db.scalars.assert_not_called()


def test_update_sector_generation_rate_distributes_and_serializes():
    db = MagicMock()
    sector = SimpleNamespace(
        id=2,
        name="Unare II",
        fill_rate_factor=Decimal("1.0"),
        generation_rate_kg_per_day=None,
        deleted_at=None,
    )
    db.get.return_value = sector
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(generation_rate_kg_per_day=None),
        SimpleNamespace(generation_rate_kg_per_day=None),
    ]

    result = update_sector_generation_rate(db, 2, 480.0)

    assert result["generationRateKgPerDay"] == 480.0
    assert result["distributedContainerCount"] == 2
    assert sector.generation_rate_kg_per_day == Decimal("480.0")
    db.commit.assert_called_once()


def test_update_sector_generation_rate_missing_raises():
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as exc:
        update_sector_generation_rate(db, 99, 500.0)

    assert exc.value.status_code == 404


def _point(sector_id: int, *, fill_kg: float, capacity: float = 1000.0):
    return SimpleNamespace(
        sector_id=sector_id,
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(fill_kg)),
        last_emptied_at=None,
        generation_rate_kg_per_day=None,
        estimated_fill_hours=None,
        fill_rate_factor_override=None,
        sector=None,
    )


def test_sectors_summary_aggregates_capacity_and_generation():
    db = MagicMock()
    sectors = [
        SimpleNamespace(
            id=1,
            name="Unare I",
            fill_rate_factor=Decimal("1.0"),
            generation_rate_kg_per_day=Decimal("600.00"),
        ),
        SimpleNamespace(
            id=2,
            name="Unare II",
            fill_rate_factor=Decimal("1.0"),
            generation_rate_kg_per_day=None,
        ),
    ]
    points = [
        _point(1, fill_kg=500.0, capacity=1000.0),
        _point(1, fill_kg=900.0, capacity=1000.0),
    ]
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=sectors)),
        MagicMock(all=MagicMock(return_value=points)),
    ]

    rows = sectors_summary(db)

    assert [row["name"] for row in rows] == ["Unare I", "Unare II"]
    first = rows[0]
    assert first["containerCount"] == 2
    assert first["totalCapacityKg"] == 2000.0
    assert first["criticalCount"] == 1
    assert first["avgFillPct"] == 70
    assert first["configuredGenerationRateKgPerDay"] == 600.0
    assert first["distributionMode"] == "equal"
    # 2 × 1000 kg a 72 h → 2000/3 kg/día ≈ 666,67.
    assert first["effectiveGenerationRateKgPerDay"] == pytest.approx(666.67, abs=0.01)

    second = rows[1]
    assert second["containerCount"] == 0
    assert second["totalCapacityKg"] == 0
    assert second["configuredGenerationRateKgPerDay"] is None


def test_effective_zone_rate_per_capita_overrides_manual():
    sector = _sector(
        generation_rate_kg_per_day=Decimal("100.00"),
        per_capita_kg_per_day=Decimal("0.750"),
        population=1000,
    )
    assert effective_zone_rate_kg_per_day(sector) == pytest.approx(750.0)


def test_effective_zone_rate_falls_back_to_manual_without_population():
    sector = _sector(
        generation_rate_kg_per_day=Decimal("100.00"),
        per_capita_kg_per_day=Decimal("0.750"),
        population=None,
    )
    assert effective_zone_rate_kg_per_day(sector) == pytest.approx(100.0)


def test_distribute_capacity_mode_is_proportional():
    db = MagicMock()
    points = [
        SimpleNamespace(max_capacity_kg=Decimal("1000"), served_population=None),
        SimpleNamespace(max_capacity_kg=Decimal("3000"), served_population=None),
    ]
    db.scalars.return_value.all.return_value = points
    sector = _sector(generation_rate_kg_per_day=Decimal("400.00"), distribution_mode="capacity")

    assert distribute_sector_generation_rate(db, sector) == 2
    assert float(points[0].generation_rate_kg_per_day) == pytest.approx(100.0)
    assert float(points[1].generation_rate_kg_per_day) == pytest.approx(300.0)


def test_distribute_population_mode_uses_served_population():
    db = MagicMock()
    points = [
        SimpleNamespace(max_capacity_kg=Decimal("1000"), served_population=Decimal("250")),
        SimpleNamespace(max_capacity_kg=Decimal("1000"), served_population=Decimal("750")),
    ]
    db.scalars.return_value.all.return_value = points
    sector = _sector(generation_rate_kg_per_day=Decimal("400.00"), distribution_mode="population")

    distribute_sector_generation_rate(db, sector)
    assert float(points[0].generation_rate_kg_per_day) == pytest.approx(100.0)
    assert float(points[1].generation_rate_kg_per_day) == pytest.approx(300.0)


def test_distribute_population_mode_falls_back_to_capacity():
    db = MagicMock()
    points = [
        SimpleNamespace(max_capacity_kg=Decimal("1000"), served_population=None),
        SimpleNamespace(max_capacity_kg=Decimal("3000"), served_population=None),
    ]
    db.scalars.return_value.all.return_value = points
    sector = _sector(generation_rate_kg_per_day=Decimal("400.00"), distribution_mode="population")

    distribute_sector_generation_rate(db, sector)
    assert float(points[0].generation_rate_kg_per_day) == pytest.approx(100.0)
    assert float(points[1].generation_rate_kg_per_day) == pytest.approx(300.0)


def test_update_sector_generation_config_sets_mode_and_per_capita():
    db = MagicMock()
    sector = _sector()
    db.get.return_value = sector
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(max_capacity_kg=Decimal("1000"), served_population=None),
    ]

    result = update_sector_generation_config(
        db,
        1,
        SectorGenerationRateUpdate(distribution_mode="capacity", per_capita_kg_per_day=0.5),
    )

    assert sector.distribution_mode == "capacity"
    assert sector.per_capita_kg_per_day == Decimal("0.5")
    assert result["distributionMode"] == "capacity"
    db.commit.assert_called_once()
