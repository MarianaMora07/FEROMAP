"""Tests Fase 2 de planificación operativa."""

from datetime import date, timedelta

from app.services.planning_service import compute_pending_priority


def test_compute_pending_priority_increases_with_age():
    old_origin = date.today() - timedelta(days=3)
    recent_origin = date.today()
    assert compute_pending_priority(old_origin) > compute_pending_priority(recent_origin)


def test_compute_pending_priority_boost():
    class Point:
        priority_boost = True

    boosted = compute_pending_priority(date.today(), Point())  # type: ignore[arg-type]
    normal = compute_pending_priority(date.today())
    assert boosted > normal
