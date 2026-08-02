"""Tests del ciclo de vida de alertas."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.alert_service import (
    list_alerts_payload,
    serialize_alert,
    update_alert_status,
)


def _alert(
    alert_id: str = "al-01",
    *,
    lifecycle_status: str = "open",
    priority: str = "critica",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=alert_id,
        source_key=None,
        priority=priority,
        title="Contenedor crítico",
        detail="Nivel 95%",
        source="Contenedor CNT-001",
        location="Unare I",
        category="contenedores",
        longitude=Decimal("-62.724"),
        latitude=Decimal("8.298"),
        lifecycle_status=lifecycle_status,
        occurred_at=datetime(2026, 6, 25, 10, 24, tzinfo=timezone.utc),
        acknowledged_at=None,
        resolved_at=None,
        activities=[],
    )


def test_serialize_alert_maps_lifecycle_to_ui_status():
    payload = serialize_alert(_alert(lifecycle_status="acknowledged"))
    assert payload["status"] == "en-progreso"
    assert payload["lifecycleStatus"] == "acknowledged"


def test_update_alert_status_resolves_and_logs_activity():
    db = SimpleNamespace()
    alert = _alert()
    db.get = lambda _model, _id: alert
    committed = {"value": False}

    def commit():
        committed["value"] = True

    db.commit = commit
    db.refresh = lambda _obj: None
    db.add = lambda _obj: None

    result = update_alert_status(db, "al-01", "resolved")

    assert alert.lifecycle_status == "resolved"
    assert alert.resolved_at is not None
    assert result["status"] == "resuelta"
    assert committed["value"] is True


def test_update_alert_status_not_found():
    db = SimpleNamespace()
    db.get = lambda _model, _id: None
    with pytest.raises(HTTPException) as exc:
        update_alert_status(db, "missing", "resolved")
    assert exc.value.status_code == 404


def test_list_alerts_payload_excludes_resolved_by_default():
    db = SimpleNamespace()
    alerts = [_alert("al-01"), _alert("al-02", lifecycle_status="resolved")]

    class _Scalars:
        def all(self):
            return [row for row in alerts if row.lifecycle_status != "resolved"]

    db.scalars = lambda _stmt: _Scalars()
    db.scalar = lambda _stmt: 0
    db.flush = lambda: None
    db.add = lambda _obj: None

    from unittest.mock import patch

    with patch("app.services.alert_service.alerts_from_db", return_value=[]):
        payload = list_alerts_payload(db, active_only=True)

    assert len(payload["alerts"]) == 1
    assert payload["alerts"][0]["id"] == "al-01"
