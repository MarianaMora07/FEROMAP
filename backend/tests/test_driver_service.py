"""Tests del servicio de conductores."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.schemas.driver import DriverUpdate
from app.services.driver_service import list_drivers, update_driver, validate_driver_assignment


def _driver(
    driver_id: int = 1,
    *,
    document: str = "V-0000001",
    first_name: str = "Juan",
    last_name: str = "Pérez",
    phone: str = "+58 414-555-0192",
    active: bool = True,
    email: str = "juan@fero.com",
) -> SimpleNamespace:
    user = SimpleNamespace(email=email, first_name=first_name, last_name=last_name, phone=phone, active=active)
    return SimpleNamespace(
        id=driver_id,
        document=document,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        active=active,
        deleted_at=None,
        user=user,
    )


def test_list_drivers_serializes_assigned_vehicle_count():
    driver = _driver()
    db = MagicMock()
    db.execute.return_value.all.return_value = [(1, 2)]
    db.scalars.return_value.unique.return_value.all.return_value = [driver]

    rows = list_drivers(db)

    assert len(rows) == 1
    assert rows[0].first_name == "Juan"
    assert rows[0].assigned_vehicles == 2


def test_validate_driver_assignment_rejects_inactive():
    driver = _driver(active=False)
    db = MagicMock()
    db.scalar.return_value = driver

    with pytest.raises(HTTPException) as exc:
        validate_driver_assignment(db, 1)

    assert exc.value.status_code == 400


def test_update_driver_syncs_user_names():
    driver = _driver()
    db = MagicMock()
    db.scalar.side_effect = [driver, None]
    db.execute.return_value.all.return_value = []
    db.flush = lambda: None

    result = update_driver(db, 1, DriverUpdate(first_name="Pedro", last_name="López"))

    assert driver.first_name == "Pedro"
    assert driver.user.first_name == "Pedro"
    assert result.last_name == "López"
