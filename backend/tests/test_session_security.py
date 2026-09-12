"""Tests de sesiones: timeout efectivo y rotación de refresh tokens (Fase 2)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.core.security import create_refresh_token, hash_token
from app.services import profile_service
from app.services.auth_service import rotate_refresh_token


def _session(**overrides):
    base = dict(
        id="s1",
        user_id=1,
        revoked_at=None,
        last_seen_at=datetime.now(timezone.utc),
        refresh_token_hash=None,
        refresh_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _user():
    return SimpleNamespace(
        id=1,
        email="plan@fero.com",
        first_name="Ana",
        last_name="Plan",
        role=SimpleNamespace(value="planificador"),
        sector=None,
        sector_id=None,
        driver_profile=None,
        active=True,
    )


def test_validate_session_revokes_after_idle_timeout(monkeypatch):
    stale = _session(last_seen_at=datetime.now(timezone.utc) - timedelta(minutes=120))
    db = MagicMock()
    db.get.return_value = stale
    monkeypatch.setattr(
        profile_service,
        "get_operational_settings",
        lambda _db: SimpleNamespace(session_timeout_minutes=60),
    )

    with pytest.raises(HTTPException) as exc:
        profile_service.validate_session(db, "s1", 1)
    assert exc.value.status_code == 401
    assert stale.revoked_at is not None


def test_validate_session_ok_when_recent(monkeypatch):
    session = _session()
    db = MagicMock()
    db.get.return_value = session
    monkeypatch.setattr(
        profile_service,
        "get_operational_settings",
        lambda _db: SimpleNamespace(session_timeout_minutes=60),
    )

    assert profile_service.validate_session(db, "s1", 1) is session


def test_rotate_refresh_token_rotates_and_detects_reuse():
    refresh = create_refresh_token("1", {"sid": "s1"})
    session = _session(refresh_token_hash=hash_token(refresh))
    user = _user()
    db = MagicMock()
    db.get.return_value = session
    db.scalar.return_value = user

    access, rotated, public = rotate_refresh_token(db, refresh)
    assert access and rotated and rotated != refresh
    assert session.refresh_token_hash == hash_token(rotated)
    assert public.email == "plan@fero.com"

    # Reusar el refresh viejo revoca la sesión.
    with pytest.raises(HTTPException) as exc:
        rotate_refresh_token(db, refresh)
    assert exc.value.status_code == 401
    assert session.revoked_at is not None
