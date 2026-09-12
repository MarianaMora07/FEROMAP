"""Tests del outbox de notificaciones: reintentos, backoff y fallo trazable (F4)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.config import settings
from app.services import notification_service as ns


def _raise(message: str):
    def _boom(*_args, **_kwargs):
        raise RuntimeError(message)

    return _boom


def _row(**overrides) -> SimpleNamespace:
    base = dict(
        id=1,
        notification_id=None,
        channel="webhook",
        target="http://example.test/hook",
        payload_json=json.dumps({"message": "m"}),
        status="pending",
        attempts=0,
        max_attempts=3,
        next_attempt_at=datetime.now(timezone.utc),
        last_error=None,
        sent_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_attempt_delivery_schedules_retry_with_backoff(monkeypatch):
    monkeypatch.setattr(ns, "_deliver", _raise("boom"))
    db = MagicMock()
    row = _row()

    assert ns._attempt_delivery(db, row) == "pending"
    assert row.attempts == 1
    assert row.next_attempt_at > datetime.now(timezone.utc)
    assert "boom" in row.last_error


def test_attempt_delivery_marks_failed_after_max_attempts(monkeypatch):
    monkeypatch.setattr(ns, "_deliver", _raise("boom"))
    db = MagicMock()
    row = _row(attempts=2, max_attempts=3)

    assert ns._attempt_delivery(db, row) == "failed"
    assert row.attempts == 3


def test_attempt_delivery_success_marks_sent(monkeypatch):
    monkeypatch.setattr(ns, "_deliver", lambda *_a, **_k: None)
    db = MagicMock()
    row = _row()

    assert ns._attempt_delivery(db, row) == "sent"
    assert row.status == "sent"
    assert row.sent_at is not None
    assert row.last_error is None


def test_backoff_grows_with_attempts():
    assert ns._backoff_seconds(1) < ns._backoff_seconds(3)


def test_process_due_outbox_does_not_create_duplicates(monkeypatch):
    monkeypatch.setattr(ns, "_deliver", lambda *_a, **_k: None)
    row = _row()
    db = MagicMock()
    db.scalars.return_value.all.return_value = [row]

    result = ns.process_due_outbox(db)

    assert result == {"processed": 1, "sent": 1, "retried": 0, "failed": 0}
    db.add.assert_not_called()


def test_notify_driver_failure_is_traceable_without_duplicates(monkeypatch):
    monkeypatch.setattr(settings, "notification_channels", "webhook", raising=False)
    monkeypatch.setattr(settings, "driver_webhook_url", "http://example.test/hook", raising=False)
    monkeypatch.setattr(settings, "notification_max_attempts", 1, raising=False)
    monkeypatch.setattr(settings, "notifications_outbox_enabled", True, raising=False)
    monkeypatch.setattr(ns, "_deliver", _raise("canal caído"))

    db = MagicMock()
    db.get.return_value = None

    result = ns.notify_driver(
        db, event_type="route_dispatched", message="hola", driver_id=None, vehicle_id=None
    )

    assert result["status"] == "failed"
    assert result["attempts"] == 1
    assert "canal caído" in result["lastError"]
    # Una notificación + una fila de outbox: exactamente 2 inserciones, sin duplicados.
    assert len(db.add.call_args_list) == 2


def test_notify_driver_success_marks_sent(monkeypatch):
    monkeypatch.setattr(settings, "notification_channels", "webhook_mock", raising=False)
    monkeypatch.setattr(settings, "notifications_outbox_enabled", True, raising=False)
    monkeypatch.setattr(ns, "_deliver", lambda *_a, **_k: None)

    db = MagicMock()
    db.get.return_value = None

    result = ns.notify_driver(db, event_type="route_dispatched", message="hola")

    assert result["status"] == "sent"
    assert result["lastError"] is None
    assert len(db.add.call_args_list) == 2
