"""Tests del servicio de frecuencias de visita (híbrida: requerida vs declarada)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.services.visit_schedule_service import _serialize_schedule


def _point(*, code: str = "CNT-001", hours: float = 72.0, sector_factor=None, override=None):
    if sector_factor is None:
        sector = SimpleNamespace(name="Unare I")
    else:
        sector = SimpleNamespace(name="Unare I", fill_rate_factor=sector_factor)
    point = SimpleNamespace(
        code=code,
        max_capacity_kg=1000.0,
        current_fill_level_kg=0.0,
        estimated_fill_hours=hours,
        last_emptied_at=None,
        sector=sector,
        status="active",
    )
    if override is not None:
        point.fill_rate_factor_override = override
    return point


def _schedule(*, visits: int = 2):
    return SimpleNamespace(
        id=1,
        collection_point_id=1,
        visits_per_week=visits,
        weekdays_json="[0, 2]",
        is_extra_visit=False,
        effective_from=date(2026, 1, 1),
        effective_until=None,
    )


def test_serialize_schedule_exposes_required_and_overloaded():
    row = _serialize_schedule(_schedule(visits=2), _point(hours=72.0))

    assert row["visitsPerWeek"] == 2
    assert row["requiredVisitsPerWeek"] == 3
    assert row["overloaded"] is True


def test_serialize_schedule_not_overloaded_when_declared_enough():
    row = _serialize_schedule(_schedule(visits=3), _point(hours=72.0))

    assert row["overloaded"] is False


def test_serialize_schedule_overloaded_from_fast_zone():
    row = _serialize_schedule(_schedule(visits=2), _point(hours=144.0, sector_factor=2.0))

    # 144 / 2 = 72 h → 3 requeridas > 2 declaradas.
    assert row["requiredVisitsPerWeek"] == 3
    assert row["overloaded"] is True
