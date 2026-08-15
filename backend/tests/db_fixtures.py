"""Helpers para mocks de BD con settings operativos por defecto."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock


def mock_db_with_settings(
    *,
    settings_blob: dict | None = None,
    scalars_result: list | None = None,
) -> MagicMock:
    payload = settings_blob or {
        "operational": {"system_name": "FEROMAP"},
        "integrations": {},
    }
    row = SimpleNamespace(settings_json=json.dumps(payload))

    def get(model, pk):
        return row if pk == 1 else None

    db = MagicMock()
    db.get = get
    db.add = MagicMock()
    db.flush = MagicMock()
    if scalars_result is not None:
        db.scalars.return_value.unique.return_value.all.return_value = scalars_result
    return db
