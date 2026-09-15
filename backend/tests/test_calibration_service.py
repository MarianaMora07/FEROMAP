"""Tests del servicio de calibración (pesos recolectados → tasa por contenedor)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.calibration_service import calibrate_collection_points


def _waypoint(point_id: int, hours_ago: float, weight: float) -> SimpleNamespace:
    moment = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return SimpleNamespace(
        collection_point_id=point_id,
        collected_weight_kg=Decimal(str(weight)),
        actual_arrival_at=moment,
        updated_at=moment,
    )


def _point(point_id: int, code: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=point_id,
        code=code,
        sector=SimpleNamespace(id=1, name="Unare I"),
        generation_rate_kg_per_day=None,
        last_calibrated_at=None,
        calibration_samples=None,
    )


def test_calibrate_sets_rate_from_collected_weights():
    db = MagicMock()
    db.get.return_value = None  # sin config persistida → defaults del algoritmo
    waypoints = [
        _waypoint(1, 20, 100.0),
        _waypoint(1, 10, 200.0),
        _waypoint(1, 0, 100.0),
    ]
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=waypoints)),
        MagicMock(all=MagicMock(return_value=[_point(1, "CNT-001")])),
    ]

    result = calibrate_collection_points(db, days=30, alpha=0.5)

    assert result["calibratedCount"] == 1
    row = result["calibrated"][0]
    assert row["code"] == "CNT-001"
    assert row["samples"] == 2
    # Muestras 20 y 10 kg/h → EWMA(0.5) = 15 kg/h → 360 kg/día.
    assert row["rateKgPerDay"] == pytest.approx(360.0)
    db.commit.assert_called_once()


def test_calibrate_skips_zone_managed_points():
    db = MagicMock()
    db.get.return_value = None
    waypoints = [_waypoint(1, 10, 100.0), _waypoint(1, 0, 100.0)]
    managed = _point(1, "CNT-001")
    managed.sector = SimpleNamespace(
        id=1,
        name="Unare I",
        generation_rate_kg_per_day=Decimal("600"),
        per_capita_kg_per_day=None,
        population=None,
    )
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=waypoints)),
        MagicMock(all=MagicMock(return_value=[managed])),
    ]

    result = calibrate_collection_points(db, days=30)

    assert result["calibratedCount"] == 0
    assert result["skipped"] == [{"code": "CNT-001", "reason": "zone_managed"}]


def test_calibrate_skips_without_enough_samples():
    db = MagicMock()
    db.get.return_value = None
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=[_waypoint(1, 0, 100.0)])),
        MagicMock(all=MagicMock(return_value=[_point(1, "CNT-001")])),
    ]

    result = calibrate_collection_points(db, days=30)

    assert result["calibratedCount"] == 0
    assert result["skipped"][0]["reason"] == "insufficient_samples"
