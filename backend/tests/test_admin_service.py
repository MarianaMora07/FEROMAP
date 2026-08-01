"""Tests del módulo de administración."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.db.models import SystemSettings
from app.schemas.admin import AdminUserUpdate, OperationalSettingsUpdate
from app.services.admin_service import (
    ensure_default_settings,
    get_operational_settings,
    list_roles,
    update_operational_settings,
    update_user,
)


def test_list_roles_includes_administrador():
    roles = list_roles()
    ids = {role.id for role in roles}
    assert "administrador" in ids
    assert len(roles) == 4


def test_ensure_default_settings_creates_singleton():
    db = SimpleNamespace()
    created = []

    def get(model, pk):
        return None

    def add(obj):
        created.append(obj)

    db.get = get
    db.add = add
    db.flush = lambda: None

    ensure_default_settings(db)

    assert len(created) == 1
    assert isinstance(created[0], SystemSettings)
    blob = json.loads(created[0].settings_json)
    assert blob["operational"]["system_name"].startswith("FEROMAP")
    assert blob["integrations"]["map_provider"] == "OpenStreetMap"


def test_get_operational_settings_reads_blob():
    blob = {
        "operational": {
            "system_name": "FEROMAP Test",
            "language": "es",
            "timezone": "America/Caracas",
            "date_format": "dd/mm/yyyy",
            "refresh_seconds": 30,
            "max_load_tons": 25.0,
            "idle_minutes": 15,
            "default_speed_kmh": 30.0,
            "max_assign_distance_km": 5.0,
            "auto_recalc_routes": True,
            "distance_unit": "km",
            "volume_unit": "m3",
            "weight_unit": "t",
            "time_unit": "min",
            "fill_threshold_pct": 80,
            "work_start": "06:00",
            "work_end": "18:00",
            "session_timeout_minutes": 60,
        },
        "integrations": {},
    }
    row = SimpleNamespace(settings_json=json.dumps(blob))
    db = SimpleNamespace()
    db.get = lambda model, pk: row if pk == 1 else None
    db.add = lambda obj: None
    db.flush = lambda: None

    settings = get_operational_settings(db)
    assert settings.system_name == "FEROMAP Test"


def test_update_operational_settings_persists_changes():
    blob = {
        "operational": {
            "system_name": "FEROMAP",
            "language": "es",
            "timezone": "America/Caracas",
            "date_format": "dd/mm/yyyy",
            "refresh_seconds": 30,
            "max_load_tons": 25.0,
            "idle_minutes": 15,
            "default_speed_kmh": 30.0,
            "max_assign_distance_km": 5.0,
            "auto_recalc_routes": True,
            "distance_unit": "km",
            "volume_unit": "m3",
            "weight_unit": "t",
            "time_unit": "min",
            "fill_threshold_pct": 80,
            "work_start": "06:00",
            "work_end": "18:00",
            "session_timeout_minutes": 60,
        },
        "integrations": {},
    }
    row = SimpleNamespace(settings_json=json.dumps(blob))
    audit_entries = []

    def get(model, pk):
        return row if pk == 1 else None

    db = SimpleNamespace()
    db.get = get
    db.add = lambda obj: audit_entries.append(obj)
    db.flush = lambda: None

    actor = SimpleNamespace(id=1, email="admin@fero.com")
    updated = update_operational_settings(
        db,
        OperationalSettingsUpdate(refresh_seconds=60, fill_threshold_pct=90),
        actor=actor,
        ip_address="127.0.0.1",
    )

    assert updated.refresh_seconds == 60
    assert updated.fill_threshold_pct == 90
    saved = json.loads(row.settings_json)
    assert saved["operational"]["refresh_seconds"] == 60
    assert len(audit_entries) == 1


def test_update_user_blocks_self_deactivation():
    actor = SimpleNamespace(id=1, email="admin@fero.com")
    user = SimpleNamespace(
        id=1,
        email="admin@fero.com",
        first_name="Admin",
        last_name="User",
        phone=None,
        role=SimpleNamespace(value="administrador"),
        sector_id=None,
        sector=None,
        active=True,
        last_login_at=None,
        created_at=None,
        password_hash="hash",
    )
    db = SimpleNamespace()

    def get_user_by_id(db, user_id):
        return user if user_id == 1 else None

    import app.services.admin_service as admin_service

    original = admin_service.get_user_by_id
    admin_service.get_user_by_id = get_user_by_id
    try:
        with pytest.raises(HTTPException) as exc:
            update_user(db, 1, AdminUserUpdate(active=False), actor=actor)
        assert exc.value.status_code == 400
    finally:
        admin_service.get_user_by_id = original
