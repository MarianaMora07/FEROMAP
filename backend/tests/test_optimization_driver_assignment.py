"""Tests de asignación conductor-vehículo en optimización."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.optimization_service import VehicleUnit, build_optimization_vehicle_units


def _driver(driver_id: int) -> SimpleNamespace:
    return SimpleNamespace(id=driver_id)


def _vehicle(
    code: str,
    *,
    vehicle_id: int,
    status: str = "available",
    default_driver_id: int | None = None,
    assigned: int | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=vehicle_id,
        code=code,
        status=status,
        max_capacity_kg=Decimal("12000"),
        fuel_consumption_rate=Decimal("0.35"),
        ideal_operators_count=6,
        assigned_operators_count=assigned,
        default_driver_id=default_driver_id,
        default_driver=_driver(default_driver_id) if default_driver_id else None,
    )


def test_build_optimization_vehicle_units_uses_default_driver():
    vehicles = [
        _vehicle("TR-03", vehicle_id=1, default_driver_id=10),
        _vehicle("TR-04", vehicle_id=2, default_driver_id=20),
    ]
    db = MagicMock()
    db.scalars.return_value = MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles))))
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    units = build_optimization_vehicle_units(db, limit=4)

    assert units == [
        VehicleUnit(
            vehicle_id=1,
            driver_id=10,
            capacity_kg=12000.0,
            fuel_rate=0.35,
            ideal_operators=6,
            assigned_operators=6,
        ),
        VehicleUnit(
            vehicle_id=2,
            driver_id=20,
            capacity_kg=12000.0,
            fuel_rate=0.35,
            ideal_operators=6,
            assigned_operators=6,
        ),
    ]


def test_build_optimization_vehicle_units_prefers_active_route_driver():
    vehicle = _vehicle("TR-08", vehicle_id=1, status="in_route", default_driver_id=10)
    active_route = SimpleNamespace(vehicle_id=1, driver_id=99, driver=_driver(99), vehicle=vehicle)

    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[vehicle])))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[active_route])))),
    ]

    units = build_optimization_vehicle_units(db, limit=4)

    assert len(units) == 1
    assert units[0].driver_id == 99


def test_build_optimization_vehicle_units_carries_crew_counts():
    vehicles = [
        _vehicle("TR-03", vehicle_id=1, default_driver_id=10, assigned=4),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    units = build_optimization_vehicle_units(db, limit=4)

    assert units[0].ideal_operators == 6
    assert units[0].assigned_operators == 4


def test_build_optimization_vehicle_units_skips_unassigned():
    vehicles = [
        _vehicle("TR-07", vehicle_id=1, default_driver_id=None),
        _vehicle("TR-03", vehicle_id=2, default_driver_id=10),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    units = build_optimization_vehicle_units(db, limit=4)

    assert len(units) == 1
    assert units[0].vehicle_id == 2
    assert units[0].driver_id == 10


def test_build_optimization_vehicle_units_excludes_maintenance():
    vehicles = [
        _vehicle("TR-07", vehicle_id=1, status="maintenance", default_driver_id=10),
        _vehicle("TR-03", vehicle_id=2, status="available", default_driver_id=20),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    units = build_optimization_vehicle_units(db, limit=4)

    assert len(units) == 1
    assert units[0].vehicle_id == 2
