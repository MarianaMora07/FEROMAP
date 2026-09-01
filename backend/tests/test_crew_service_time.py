"""Tests del contrato de dotación (ADR-003, Fase 0)."""

from app.domain.crew_service_time import (
    BASE_SERVICE_SECONDS,
    build_crew_service_breakdown,
    missing_field_operators,
    resolve_effective_assigned,
    route_total_duration_seconds,
    service_time_seconds_per_stop,
)


def test_service_time_full_crew():
    assert service_time_seconds_per_stop(6) == BASE_SERVICE_SECONDS == 1200


def test_service_time_one_field_operator_missing():
    assert service_time_seconds_per_stop(5) == 1380


def test_service_time_driver_only():
    assert service_time_seconds_per_stop(1) == 2100
    assert missing_field_operators(1) == 5


def test_operators_shortage_global():
    assert resolve_effective_assigned(6, operators_shortage=2) == 4
    assert service_time_seconds_per_stop(4) == 1560


def test_route_duration_includes_stops():
    # 5 paradas, viaje 40 min, turno completo → 2400 + 5*1200 = 8400 s
    total = route_total_duration_seconds(2400, 5, 6)
    assert total == 8400


def test_breakdown_crew_label():
    breakdown = build_crew_service_breakdown(travel_seconds=2400, stop_count=5, assigned=5)
    assert breakdown.missing_field_operators == 1
    assert "conductor + 4 operarios" in breakdown.to_dict()["crewLabel"]
