"""Tests del servicio de configuración por zona (F8)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.schemas.zone import ParishZoneUpdate
from app.services.zone_config_service import (
    list_zones,
    parish_for_sectors,
    parish_window_secs,
    sector_windows,
    serialize_parish_zone,
    update_zone,
)


def _parish(**overrides):
    base = {
        "id": 1,
        "name": "Unare",
        "city": "Ciudad Guayana",
        "depot_lat": None,
        "depot_lon": None,
        "landfill_lat": None,
        "landfill_lon": None,
        "time_window_start": None,
        "time_window_end": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_parish_window_secs_reads_configuration():
    parish = _parish(time_window_start="06:00", time_window_end="12:00")
    assert parish_window_secs(parish) == (0, 6 * 3600)
    assert parish_window_secs(_parish()) is None
    assert parish_window_secs(_parish(time_window_start="06:00")) is None


def test_sector_windows_only_returns_configured_sectors():
    configured = _parish(id=1, time_window_start="06:00", time_window_end="12:00")
    unconfigured = _parish(id=2)
    db = MagicMock()
    db.execute.return_value.all.return_value = [(10, configured), (11, unconfigured)]

    windows = sector_windows(db, [10, 11, None])
    assert windows == {10: (0, 6 * 3600)}


def test_sector_windows_empty_input_skips_query():
    db = MagicMock()
    assert sector_windows(db, [None, None]) == {}
    db.execute.assert_not_called()


def test_parish_for_sectors_uniform():
    db = MagicMock()
    db.scalars.return_value.all.return_value = [1, 1, 1]
    assert parish_for_sectors(db, [10, 11]) == 1


def test_parish_for_sectors_mixed_is_none():
    db = MagicMock()
    db.scalars.return_value.all.return_value = [1, 2]
    assert parish_for_sectors(db, [10, 11]) is None


def test_parish_for_sectors_empty_is_none():
    db = MagicMock()
    assert parish_for_sectors(db, [None]) is None
    db.scalars.assert_not_called()


def test_serialize_parish_zone():
    parish = _parish(depot_lat=8.3, depot_lon=-62.7)
    assert serialize_parish_zone(parish) == {
        "id": 1,
        "name": "Unare",
        "city": "Ciudad Guayana",
        "depotLat": 8.3,
        "depotLon": -62.7,
        "landfillLat": None,
        "landfillLon": None,
        "timeWindowStart": None,
        "timeWindowEnd": None,
    }


def test_list_zones_serializes_all():
    db = MagicMock()
    db.scalars.return_value.all.return_value = [_parish(id=1, name="Unare"), _parish(id=2, name="Dalla Costa")]
    assert [zone["name"] for zone in list_zones(db)] == ["Unare", "Dalla Costa"]


def test_update_zone_persists_valid_window():
    parish = _parish()
    db = MagicMock()
    db.get.return_value = parish

    result = update_zone(
        db, 1, ParishZoneUpdate(time_window_start="07:00", time_window_end="09:00")
    )

    assert parish.time_window_start == "07:00"
    assert result["timeWindowStart"] == "07:00"
    db.commit.assert_called_once()


def test_update_zone_rejects_incomplete_window():
    parish = _parish()
    db = MagicMock()
    db.get.return_value = parish

    with pytest.raises(HTTPException) as exc:
        update_zone(db, 1, ParishZoneUpdate(time_window_start="07:00"))

    assert exc.value.status_code == 400
    db.commit.assert_not_called()


def test_update_zone_missing_parish_raises():
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as exc:
        update_zone(db, 99, ParishZoneUpdate(depot_lat=8.3))

    assert exc.value.status_code == 404
