"""Ausentismo global del turno — appliedCrewModifiers y resolución de flota."""

from __future__ import annotations

from app.domain.crew_service_time import BASE_SERVICE_SECONDS
from app.services.optimization_service import VehicleUnit, _resolve_fleet_crew, compute_service_time_sec
from app.services.scenario_parameters import build_applied_crew_modifiers


def _vehicle(assigned: int = 6) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=1,
        driver_id=1,
        capacity_kg=100.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=assigned,
    )


def test_build_applied_crew_modifiers_empty_when_no_shortage():
    assert build_applied_crew_modifiers(0) == {}
    assert build_applied_crew_modifiers(None) == {}


def test_shortage_two_on_full_crew_yields_six_minutes_per_stop():
    modifiers = build_applied_crew_modifiers(2)
    assert modifiers["operatorsShortage"] == 2
    assert modifiers["effectiveAssignedOperators"] == 4
    assert modifiers["serviceSecondsPerStop"] == 360
    assert modifiers["baselineServiceSecondsPerStop"] == BASE_SERVICE_SECONDS == 300


def test_compute_service_time_shortage_zero_vs_two():
    vehicle = _vehicle(6)
    assert compute_service_time_sec(vehicle, operators_shortage=0) == 300
    assert compute_service_time_sec(vehicle, operators_shortage=2) == 360


def test_resolve_fleet_crew_applies_shortage_before_engine():
    resolved = _resolve_fleet_crew([_vehicle(6)], 2)
    assert resolved[0].assigned_operators == 4
    assert compute_service_time_sec(resolved[0]) == 360
