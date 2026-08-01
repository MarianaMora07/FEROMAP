"""Tests del servicio de vehículos."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.vehicle_service import (
    ASSIGNABLE_STATUSES,
    build_summary_from_vehicles,
    export_vehicles_csv,
    filter_vehicle_rows,
    list_vehicles,
    resolve_vehicle_driver_id,
    update_vehicle,
    vehicle_detail,
    vehicle_maintenance_history,
    vehicles_optimization_context,
    vehicles_summary,
)


def _driver(
    first_name: str = "Juan",
    last_name: str = "Pérez",
    phone: str = "+58 414-555-0192",
    driver_id: int = 1,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=driver_id,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
    )


def _vehicle(
    code: str,
    *,
    vehicle_id: int = 1,
    status: str = "available",
    max_capacity_kg: float = 15000,
    default_driver: SimpleNamespace | None = None,
    license_plate: str = "A12BC3D",
) -> SimpleNamespace:
    now = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=vehicle_id,
        code=code,
        license_plate=license_plate,
        status=status,
        max_capacity_kg=Decimal(str(max_capacity_kg)),
        fuel_consumption_rate=Decimal("0.35"),
        ideal_operators_count=2,
        default_driver_id=default_driver.id if default_driver else None,
        default_driver=default_driver,
        created_at=now,
        updated_at=now,
    )


def _route(
    *,
    route_id: int = 10,
    vehicle_id: int = 1,
    driver_id: int | None = None,
    driver: SimpleNamespace | None = None,
    vehicle: SimpleNamespace | None = None,
) -> SimpleNamespace:
    resolved_driver_id = driver_id if driver_id is not None else (driver.id if driver else None)
    return SimpleNamespace(
        id=route_id,
        vehicle_id=vehicle_id,
        driver_id=resolved_driver_id,
        driver=driver,
        vehicle=vehicle,
        status="in_progress",
    )


def test_build_summary_from_vehicles_counts_by_status_and_assignable():
    vehicles = [
        _vehicle("TR-01", vehicle_id=1, status="available"),
        _vehicle("TR-02", vehicle_id=2, status="in_route"),
        _vehicle("TR-03", vehicle_id=3, status="maintenance"),
        _vehicle("TR-04", vehicle_id=4, status="inactive"),
        _vehicle("TR-05", vehicle_id=5, status="available"),
    ]

    summary = build_summary_from_vehicles(vehicles)

    assert summary["total"] == 5
    assert summary["assignableCount"] == 3
    assert summary["byStatus"]["disponible"] == 2
    assert summary["byStatus"]["en-ruta"] == 1
    assert summary["byStatus"]["mantenimiento"] == 1
    assert summary["byStatus"]["fuera-de-servicio"] == 1


def test_list_vehicles_uses_default_driver_and_null_telemetry(monkeypatch):
    default_driver = _driver()
    vehicle = _vehicle("TR-08", default_driver=default_driver, status="available")

    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[vehicle])))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    rows = list_vehicles(db)

    assert len(rows) == 1
    assert rows[0]["id"] == "TR-08"
    assert rows[0]["driver"] == "Juan Pérez"
    assert rows[0]["driverPhone"] == "+58 414-555-0192"
    assert rows[0]["maxCapacityKg"] == 15000.0
    assert rows[0]["fuelPct"] is None
    assert rows[0]["capacityPct"] is None
    assert rows[0]["currentRoute"] is None


def test_list_vehicles_prefers_active_route_driver_and_sets_current_route():
    route_driver = _driver(first_name="Carlos", last_name="Rivas", phone="+58 424-555-0144", driver_id=2)
    default_driver = _driver()
    vehicle = _vehicle("TR-08", vehicle_id=1, status="in_route", default_driver=default_driver)
    active_route = _route(route_id=99, vehicle_id=1, driver=route_driver, vehicle=vehicle)

    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[vehicle])))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[active_route])))),
    ]

    rows = list_vehicles(db)

    assert rows[0]["driver"] == "Carlos Rivas"
    assert rows[0]["driverPhone"] == "+58 424-555-0144"
    assert rows[0]["currentRoute"] == "Ruta optimizada TR-08"
    assert rows[0]["activeRouteId"] == 99


def test_vehicle_detail_not_found():
    db = MagicMock()
    db.scalar.return_value = None

    with pytest.raises(HTTPException) as exc:
        vehicle_detail(db, "TR-404")

    assert exc.value.status_code == 404


def test_resolve_vehicle_driver_id_prefers_active_route():
    vehicle = _vehicle("TR-08", default_driver=_driver(driver_id=1))
    active_route = _route(driver=_driver(driver_id=2), driver_id=2)

    assert resolve_vehicle_driver_id(vehicle, active_route=active_route) == 2


def test_resolve_vehicle_driver_id_uses_default_driver():
    vehicle = _vehicle("TR-03", default_driver=_driver(driver_id=5))

    assert resolve_vehicle_driver_id(vehicle, active_route=None) == 5


def test_assignable_statuses_match_optimization_fleet():
    assert ASSIGNABLE_STATUSES == frozenset({"available", "in_route"})


def test_update_vehicle_sets_maintenance_status():
    vehicle = _vehicle("TR-03", status="available")
    db = MagicMock()
    db.scalar.side_effect = [vehicle, vehicle]
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=[vehicle])),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    from app.schemas.vehicle import VehicleUpdate

    result = update_vehicle(db, "TR-03", VehicleUpdate(status="maintenance"))

    assert vehicle.status == "maintenance"
    assert result["id"] == "TR-03"
    assert result["status"] == "mantenimiento"


def test_update_vehicle_rejects_invalid_status():
    vehicle = _vehicle("TR-03")
    db = MagicMock()
    db.scalar.return_value = vehicle

    from app.schemas.vehicle import VehicleUpdate

    payload = VehicleUpdate.model_construct(status="broken")
    with pytest.raises(HTTPException) as exc:
        update_vehicle(db, "TR-03", payload)

    assert exc.value.status_code == 422


def _serialized_row(
    code: str,
    *,
    status: str = "disponible",
    driver: str = "Juan Pérez",
) -> dict:
    return {
        "id": code,
        "plate": "A12BC3D",
        "status": status,
        "driver": driver,
        "driverPhone": "+58 414-555-0192",
        "type": "Compactador",
        "maxCapacityKg": 15000.0,
        "currentRoute": None,
        "updatedAt": "01/08/2026 12:00",
    }


def test_filter_vehicle_rows_assignable_only():
    rows = [
        _serialized_row("TR-01", status="disponible"),
        _serialized_row("TR-02", status="en-ruta"),
        _serialized_row("TR-03", status="mantenimiento"),
    ]

    filtered = filter_vehicle_rows(rows, assignable_only=True)

    assert [row["id"] for row in filtered] == ["TR-01", "TR-02"]


def test_filter_vehicle_rows_status_and_search():
    rows = [
        _serialized_row("TR-01", status="disponible", driver="Juan Pérez"),
        _serialized_row("TR-02", status="mantenimiento", driver="Carlos Rivas"),
    ]

    filtered = filter_vehicle_rows(rows, status="mantenimiento", q="carlos")

    assert len(filtered) == 1
    assert filtered[0]["id"] == "TR-02"


def test_vehicles_summary_from_database():
    vehicles = [
        _vehicle("TR-01", vehicle_id=1, status="available"),
        _vehicle("TR-02", vehicle_id=2, status="maintenance"),
    ]
    db = MagicMock()
    db.scalars.return_value = MagicMock(all=MagicMock(return_value=vehicles))

    summary = vehicles_summary(db)

    assert summary["total"] == 2
    assert summary["assignableCount"] == 1
    assert summary["byStatus"]["disponible"] == 1
    assert summary["byStatus"]["mantenimiento"] == 1


def test_list_vehicles_returns_multiple_serialized_rows():
    vehicles = [
        _vehicle("TR-01", vehicle_id=1, status="available"),
        _vehicle("TR-02", vehicle_id=2, status="in_route"),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    rows = list_vehicles(db)

    assert len(rows) == 2
    assert rows[0]["id"] == "TR-01"
    assert rows[1]["id"] == "TR-02"
    assert rows[0]["status"] == "disponible"
    assert rows[1]["status"] == "en-ruta"


def test_export_vehicles_csv_filters_assignable(monkeypatch):
    rows = [
        _serialized_row("TR-01", status="disponible"),
        _serialized_row("TR-02", status="mantenimiento"),
    ]
    monkeypatch.setattr(
        "app.services.vehicle_service.list_vehicles",
        lambda _db: rows,
    )

    csv_content = export_vehicles_csv(MagicMock(), assignable_only=True)

    assert "TR-01" in csv_content
    assert "TR-02" not in csv_content
    assert "id,plate,status" in csv_content


def test_vehicle_maintenance_history_returns_incidents():
    vehicle = _vehicle("TR-07", vehicle_id=7, status="maintenance")
    incident = SimpleNamespace(
        id=1,
        incident_type="breakdown",
        description="Falla mecánica",
        reported_at=datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc),
        resolved_at=None,
        affects_active_route=True,
        route_id=5,
    )
    db = MagicMock()
    db.scalar.return_value = vehicle
    db.scalars.return_value = MagicMock(all=MagicMock(return_value=[incident]))

    history = vehicle_maintenance_history(db, "TR-07")

    assert len(history) == 1
    assert history[0]["incidentType"] == "breakdown"
    assert history[0]["status"] == "activo"
