"""Tests de preferencias y sesiones de perfil."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.profile import ChangePasswordRequest, ProfilePreferencesUpdate
from app.services.profile_service import (
    change_password,
    ensure_user_preferences,
    preferences_to_schema,
    update_preferences,
)


def _user(user_id: int = 1) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        email="plan@fero.com",
        password_hash="pbkdf2:sha256$600000$fero-demo$deadbeef",
        first_name="Ana",
        last_name="Plan",
        phone=None,
        role=SimpleNamespace(value="planificador"),
        sector=None,
        sector_id=None,
        active=True,
        avatar_url=None,
        last_login_at=None,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        preferences=None,
        sessions=[],
    )


def test_ensure_user_preferences_creates_defaults():
    db = SimpleNamespace()
    user = _user()
    created = []

    def add(obj):
        created.append(obj)
        user.preferences = obj

    db.add = add
    db.flush = lambda: None

    prefs = ensure_user_preferences(db, user)

    assert prefs.theme == "light"
    assert prefs.language == "es"
    assert len(created) == 1


def test_update_preferences_validates_theme():
    db = SimpleNamespace()
    prefs = SimpleNamespace(
        theme="light",
        language="es",
        units="metric",
        default_view="dashboard",
        report_frequency="daily",
        page_size=20,
        email_notifications=True,
        system_notifications=True,
        address=None,
        timezone="America/Caracas",
    )
    user = _user()
    user.preferences = prefs
    db.flush = lambda: None

    with pytest.raises(HTTPException) as exc:
        update_preferences(db, user, ProfilePreferencesUpdate(theme="neon"))
    assert exc.value.status_code == 400


def test_preferences_to_schema_uses_camel_aliases():
    prefs = SimpleNamespace(
        theme="dark",
        language="en",
        units="imperial",
        default_view="map",
        report_frequency="weekly",
        page_size=50,
        email_notifications=False,
        system_notifications=True,
        address="Sector Unare",
        timezone="America/Caracas",
    )
    schema = preferences_to_schema(prefs)
    assert schema.theme == "dark"
    assert schema.default_view == "map"


def test_change_password_rejects_wrong_current(monkeypatch):
    db = SimpleNamespace()
    user = _user()
    db.flush = lambda: None

    monkeypatch.setattr("app.services.profile_service.verify_password", lambda *_: False)

    with pytest.raises(HTTPException) as exc:
        change_password(db, user, ChangePasswordRequest(current_password="old", new_password="newpass12"))
    assert exc.value.status_code == 400
