"""Tests de instalaciones operativas (Fase 9, Fase 1)."""

from __future__ import annotations

import json
from types import SimpleNamespace

from app.schemas.admin import OperationalSettingsUpdate
from app.services.admin_service import get_operational_settings, update_operational_settings
from app.services.operational_facilities_service import resolve_operational_facilities


def _settings_db(blob: dict):
    row = SimpleNamespace(settings_json=json.dumps(blob))

    def get(model, pk):
        return row if pk == 1 else None

    db = SimpleNamespace()
    db.get = get
    db.add = lambda obj: None
    db.flush = lambda: None
    return db, row


def test_operational_settings_defaults_include_landfill():
    db, _ = _settings_db({"operational": {"system_name": "FEROMAP"}, "integrations": {}})
    settings = get_operational_settings(db)
    assert settings.landfill_lat == -62.690
    assert settings.landfill_lon == 8.280
    assert settings.landfill_unload_minutes == 15
    assert settings.work_start == "06:00"
    assert settings.work_end == "18:00"


def test_update_landfill_coordinates_persists():
    db, row = _settings_db({"operational": {"system_name": "FEROMAP"}, "integrations": {}})
    actor = SimpleNamespace(id=1, email="admin@fero.com")
    updated = update_operational_settings(
        db,
        OperationalSettingsUpdate(landfill_lat=-62.7, landfill_lon=8.27),
        actor=actor,
    )
    assert updated.landfill_lat == -62.7
    assert updated.landfill_lon == 8.27
    saved = json.loads(row.settings_json)
    assert saved["operational"]["landfill_lat"] == -62.7


def test_resolve_operational_facilities_reads_settings():
    db, _ = _settings_db(
        {
            "operational": {
                "landfill_lat": -62.7,
                "landfill_lon": 8.27,
                "landfill_unload_minutes": 20,
                "work_start": "06:00",
                "work_end": "18:00",
            },
            "integrations": {},
        }
    )
    facilities = resolve_operational_facilities(db)
    assert facilities.landfill == (8.27, -62.7)
    assert facilities.unload_seconds == 1200
    assert facilities.shift_budget_seconds == 43200
