"""Fase 8.5 — Pruebas de aceptación (dotación, KPIs, ACO).

Matriz de verificación:
| Test | Verifica |
|------|----------|
| service_time | 6→300s, 5→330s, 1→450s (conductor + 5 operarios) |
| KPI duración | Distancia igual, duración sube al bajar assigned |
| operatorsShortage | Modifier global reduce dotación efectiva |
| ACO | Fitness no cambia al variar solo dotación (misma semilla → misma ruta) |
"""

from __future__ import annotations

import pytest

from app.domain.crew_service_time import (
    BASE_SERVICE_SECONDS,
    FIELD_OPERATORS_PER_VEHICLE,
    PENALTY_PER_MISSING_FIELD_OPERATOR_SEC,
    resolve_effective_assigned,
    service_time_seconds_per_stop,
)
from app.services.optimization_service import (
    CustomerNode,
    VehicleUnit,
    _aco_cvrp,
    _baseline_route,
    _compute_kpis,
    _resolve_fleet_crew,
    compute_service_time_sec,
)
from app.services.scenario_parameters import build_applied_crew_modifiers


def _symmetric_matrix(n: int, base: float = 100.0) -> tuple[list[list[float]], list[list[float]]]:
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d = base * abs(i - j)
            dist[i][j] = d
            time[i][j] = d / 10
    return dist, time


def _vehicle(assigned: int) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=1,
        driver_id=1,
        capacity_kg=100.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=assigned,
    )


class TestServiceTimeFormula:
    """Fórmula: conductor fijo + hasta 5 operarios de campo."""

    @pytest.mark.parametrize(
        ("assigned", "expected_seconds"),
        [
            (6, 300),
            (5, 330),
            (1, 450),
        ],
        ids=["full-crew-6", "missing-one-field-5", "driver-only-1"],
    )
    def test_service_time_seconds_per_stop(self, assigned: int, expected_seconds: int) -> None:
        assert service_time_seconds_per_stop(assigned) == expected_seconds

    def test_contract_constants(self) -> None:
        assert BASE_SERVICE_SECONDS == 300
        assert FIELD_OPERATORS_PER_VEHICLE == 5
        assert PENALTY_PER_MISSING_FIELD_OPERATOR_SEC == 30

    def test_compute_service_time_sec_on_vehicle_unit(self) -> None:
        assert compute_service_time_sec(_vehicle(6)) == 300
        assert compute_service_time_sec(_vehicle(5)) == 330
        assert compute_service_time_sec(_vehicle(1)) == 450


class TestKpiDurationWithCrew:
    """Distancia igual en KPIs; duración sube al bajar assigned."""

    def test_same_distance_higher_duration_when_assigned_decreases(self) -> None:
        n_customers = 5
        demands = [8.0] * n_customers
        capacities = [80.0]
        dist, time = _symmetric_matrix(n_customers + 1, base=100.0)

        optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=42)
        current = _baseline_route(n_customers, dist, time)
        customers = [
            CustomerNode(i, f"C{i}", 0, 8.0, 50, 0.0, 0.0) for i in range(1, n_customers + 1)
        ]
        served = {c.code for c in customers}

        kpis_full = _compute_kpis(
            current, optimized, customers, served, [_vehicle(6)], dist, time
        )
        kpis_reduced = _compute_kpis(
            current, optimized, customers, served, [_vehicle(4)], dist, time
        )

        assert kpis_full["distanceKm"]["optimized"] == pytest.approx(
            kpis_reduced["distanceKm"]["optimized"]
        )
        assert kpis_reduced["durationHours"]["optimized"] > kpis_full["durationHours"]["optimized"]
        assert kpis_reduced["durationBreakdown"]["optimized"]["serviceHours"] > (
            kpis_full["durationBreakdown"]["optimized"]["serviceHours"]
        )
        assert kpis_full["durationBreakdown"]["optimized"]["travelHours"] == pytest.approx(
            kpis_reduced["durationBreakdown"]["optimized"]["travelHours"]
        )


class TestOperatorsShortageGlobalModifier:
    """operatorsShortage reduce dotación efectiva antes del motor."""

    def test_resolve_effective_assigned_formula(self) -> None:
        assert resolve_effective_assigned(6, operators_shortage=0) == 6
        assert resolve_effective_assigned(6, operators_shortage=2) == 4
        assert resolve_effective_assigned(4, operators_shortage=2) == 2
        assert resolve_effective_assigned(2, operators_shortage=5) == 1

    def test_fleet_resolution_before_engine(self) -> None:
        resolved = _resolve_fleet_crew([_vehicle(6), _vehicle(5)], operators_shortage=2)
        assert resolved[0].assigned_operators == 4
        assert resolved[1].assigned_operators == 3

    def test_applied_crew_modifiers_persisted_shape(self) -> None:
        modifiers = build_applied_crew_modifiers(2)
        assert modifiers["operatorsShortage"] == 2
        assert modifiers["effectiveAssignedOperators"] == 4
        assert modifiers["serviceSecondsPerStop"] == 360
        assert "conductor" in modifiers["narrative"].lower()

    def test_shortage_increases_kpi_duration_with_same_aco_solution(self) -> None:
        n_customers = 4
        dist, time = _symmetric_matrix(n_customers + 1, base=90.0)
        optimized = _aco_cvrp(n_customers, [5.0] * n_customers, [40.0], dist, time, seed=7)
        current = _baseline_route(n_customers, dist, time)
        customers = [
            CustomerNode(i, f"C{i}", 0, 5.0, 50, 0.0, 0.0) for i in range(1, n_customers + 1)
        ]
        served = {c.code for c in customers}

        fleet_full = _resolve_fleet_crew([_vehicle(6)], 0)
        fleet_short = _resolve_fleet_crew([_vehicle(6)], 2)

        kpis_full = _compute_kpis(
            current, optimized, customers, served, fleet_full, dist, time
        )
        kpis_short = _compute_kpis(
            current, optimized, customers, served, fleet_short, dist, time
        )

        assert kpis_full["distanceKm"]["optimized"] == pytest.approx(
            kpis_short["distanceKm"]["optimized"]
        )
        assert kpis_short["durationHours"]["optimized"] > kpis_full["durationHours"]["optimized"]


class TestAcoFitnessIndependentOfCrew:
    """ACO minimiza distancia; la dotación no entra al fitness."""

    def test_same_seed_same_route_and_distance(self) -> None:
        n_customers = 6
        demands = [10.0, 15.0, 8.0, 12.0, 20.0, 5.0]
        capacities = [40.0, 40.0]
        dist, time = _symmetric_matrix(n_customers + 1, base=80.0)

        first = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=99)
        second = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=99)

        assert first.distance_m == pytest.approx(second.distance_m)
        assert first.vehicle_routes == second.vehicle_routes
        assert first.duration_s == pytest.approx(second.duration_s)

    def test_crew_only_changes_kpi_duration_not_aco_output(self) -> None:
        n_customers = 5
        demands = [8.0] * n_customers
        capacities = [80.0]
        dist, time = _symmetric_matrix(n_customers + 1, base=100.0)

        optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=42)
        current = _baseline_route(n_customers, dist, time)
        customers = [
            CustomerNode(i, f"C{i}", 0, 8.0, 50, 0.0, 0.0) for i in range(1, n_customers + 1)
        ]
        served = {c.code for c in customers}

        for assigned in (6, 5, 4, 1):
            kpis = _compute_kpis(
                current, optimized, customers, served, [_vehicle(assigned)], dist, time
            )
            assert kpis["distanceKm"]["optimized"] == pytest.approx(optimized.distance_m / 1000)
            assert optimized.distance_m > 0

        kpis_full = _compute_kpis(
            current, optimized, customers, served, [_vehicle(6)], dist, time
        )
        kpis_min = _compute_kpis(
            current, optimized, customers, served, [_vehicle(1)], dist, time
        )
        assert kpis_full["distanceKm"]["optimized"] == kpis_min["distanceKm"]["optimized"]
        assert kpis_min["durationHours"]["optimized"] > kpis_full["durationHours"]["optimized"]
