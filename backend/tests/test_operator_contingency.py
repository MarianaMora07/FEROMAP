"""Tests de incidencias operador."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.contingency_service import list_recent_incidents


def test_list_recent_incidents_filters_by_vehicle():
    now = datetime.now(timezone.utc)
    vehicle_a = SimpleNamespace(code="TR-08", id=1)
    vehicle_b = SimpleNamespace(code="TR-04", id=2)
    incidents = [
        SimpleNamespace(
            id=1,
            vehicle=vehicle_a,
            route=None,
            incident_type="breakdown",
            description="Avería",
            reported_at=now - timedelta(hours=2),
            affects_active_route=True,
        ),
        SimpleNamespace(
            id=2,
            vehicle=vehicle_b,
            route=None,
            incident_type="breakdown",
            description="Avería",
            reported_at=now - timedelta(hours=1),
            affects_active_route=True,
        ),
    ]

    db = MagicMock()
    db.scalars.return_value.all.return_value = incidents

    items = list_recent_incidents(db, vehicle_id="TR-08", hours=48, limit=10)
    assert len(items) == 1
    assert items[0]["vehicleId"] == "TR-08"
    assert items[0]["relatedAlertId"].startswith("al-inc-")
