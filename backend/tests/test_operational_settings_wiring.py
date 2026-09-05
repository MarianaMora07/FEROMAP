"""Tests de conexión de configs operativas (Tarea 7)."""

from __future__ import annotations

from types import SimpleNamespace

from app.services import operational_facilities_service
from app.services.optimization_service import (
    FUEL_L_PER_KM,
    RouteSolution,
    VehicleUnit,
    _solution_fuel_liters,
    cap_shift_budget_seconds,
)


# --- Recorte de jornada ------------------------------------------------------


def test_cap_shift_budget_keeps_installation_when_not_requested():
    assert cap_shift_budget_seconds(43_200, None) == 43_200
    assert cap_shift_budget_seconds(43_200, 0) == 43_200


def test_cap_shift_budget_cuts_to_requested_hours():
    assert cap_shift_budget_seconds(43_200, 8) == 8 * 3600
    assert cap_shift_budget_seconds(43_200, 6) == 6 * 3600


def test_cap_shift_budget_ignores_longer_requests():
    # Jornada solicitada mayor que la instalación: se conserva la de la instalación.
    assert cap_shift_budget_seconds(43_200, 14) == 43_200


# --- Combustible por vehículo ------------------------------------------------


def _vehicles() -> list[VehicleUnit]:
    return [
        VehicleUnit(1, 1, 10000.0, 0.5, 6, 6, code="V1"),
        VehicleUnit(2, 2, 10000.0, 1.25, 6, 6, code="V2"),
    ]


def test_fuel_uses_per_vehicle_rate():
    dist = [[0.0, 1000.0, 2000.0], [1000.0, 0.0, 3000.0], [2000.0, 3000.0, 0.0]]
    solution = RouteSolution(vehicle_routes=[[0, 1, 0], [0, 2, 0]])
    # Ruta 1: 2 km × 0.5 L/km = 1 L; ruta 2: 4 km × 1.25 L/km = 5 L.
    assert _solution_fuel_liters(solution, _vehicles(), dist) == 6.0


def test_fuel_falls_back_to_global_rate_when_zero():
    dist = [[0.0, 1000.0, 0.0], [1000.0, 0.0, 1000.0], [0.0, 1000.0, 0.0]]
    vehicle = VehicleUnit(1, 1, 10000.0, 0.0, 6, 6, code="V1")
    solution = RouteSolution(vehicle_routes=[[0, 1, 0]])
    assert _solution_fuel_liters(solution, [vehicle], dist) == 2.0 * FUEL_L_PER_KM


# --- Velocidad de respaldo desde instalaciones -------------------------------


def _settings(**overrides) -> SimpleNamespace:
    base = {
        "work_start": "06:00",
        "work_end": "18:00",
        "landfill_unload_minutes": 15,
        "depot_lon": -62.715,
        "depot_lat": 8.295,
        "landfill_lon": -62.71,
        "landfill_lat": 8.3,
        "default_speed_kmh": 42.0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_resolved_facilities_reads_default_speed(monkeypatch):
    monkeypatch.setattr(
        operational_facilities_service,
        "get_operational_settings",
        lambda _db: _settings(),
    )
    facilities = operational_facilities_service.resolve_operational_facilities(object())
    assert facilities.default_speed_kmh == 42.0
    assert facilities.shift_budget_seconds == 12 * 3600


def test_resolved_facilities_default_speed_when_unset(monkeypatch):
    monkeypatch.setattr(
        operational_facilities_service,
        "get_operational_settings",
        lambda _db: _settings(default_speed_kmh=None),
    )
    facilities = operational_facilities_service.resolve_operational_facilities(object())
    assert facilities.default_speed_kmh == 25.0
