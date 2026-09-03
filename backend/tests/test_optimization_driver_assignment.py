"""Tests de asignación conductor-vehículo y partición por sectores en optimización."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.optimization_service import (
    CustomerNode,
    VehicleUnit,
    build_optimization_vehicle_units,
    partition_customers_by_vehicle_sectors,
    resolve_sector_driver_map_for_optimization,
    _baseline_routes_partitioned,
    _extract_node_submatrix,
    _optimize_by_sector_assignment,
    _remap_local_route_to_global,
    _supersede_daily_plan_optimized_routes,
)


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


def _customer(point_id: int, code: str, sector_id: int | None) -> CustomerNode:
    return CustomerNode(
        point_id=point_id,
        code=code,
        graph_node=0,
        demand_kg=10.0,
        fill_pct=50,
        lon=-62.75,
        lat=8.27,
        sector_id=sector_id,
    )


def _unit(vehicle_id: int, driver_id: int) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        capacity_kg=12000.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=6,
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

    units = build_optimization_vehicle_units(db)

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

    units = build_optimization_vehicle_units(db)

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

    units = build_optimization_vehicle_units(db)

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

    units = build_optimization_vehicle_units(db)

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

    units = build_optimization_vehicle_units(db)

    assert len(units) == 1
    assert units[0].vehicle_id == 2


def test_build_optimization_vehicle_units_fleet_limit_caps():
    vehicles = [
        _vehicle("TR-01", vehicle_id=1, default_driver_id=10),
        _vehicle("TR-02", vehicle_id=2, default_driver_id=20),
        _vehicle("TR-03", vehicle_id=3, default_driver_id=30),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=vehicles)))),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]

    units = build_optimization_vehicle_units(db, fleet_limit=2)

    assert [u.vehicle_id for u in units] == [1, 2]


def test_partition_customers_by_vehicle_sectors_assigns_by_driver():
    customers = [
        _customer(1, "A", sector_id=10),
        _customer(2, "B", sector_id=20),
        _customer(3, "C", sector_id=10),
        _customer(4, "D", sector_id=30),
    ]
    vehicles = [_unit(1, driver_id=100), _unit(2, driver_id=200)]
    sector_map = {10: 100, 20: 200, 30: 999}

    assigned, unassigned = partition_customers_by_vehicle_sectors(customers, vehicles, sector_map)

    assert assigned == [[1, 3], [2]]
    assert unassigned == [4]


def test_partition_customers_by_vehicle_sectors_first_vehicle_wins_duplicate_driver():
    customers = [_customer(1, "A", sector_id=10), _customer(2, "B", sector_id=10)]
    vehicles = [_unit(1, driver_id=100), _unit(2, driver_id=100)]
    sector_map = {10: 100}

    assigned, unassigned = partition_customers_by_vehicle_sectors(customers, vehicles, sector_map)

    assert assigned == [[1, 2], []]
    assert unassigned == []


def test_resolve_sector_driver_map_fills_missing_round_robin():
    customers = [
        _customer(1, "A", sector_id=1),
        _customer(2, "B", sector_id=2),
        _customer(3, "C", sector_id=3),
    ]
    vehicles = [_unit(1, driver_id=10), _unit(2, driver_id=20)]

    resolved = resolve_sector_driver_map_for_optimization(customers, vehicles, {1: 10})

    assert resolved[1] == 10
    assert resolved[2] == 10
    assert resolved[3] == 20


def test_remap_local_route_to_global():
    remapped = _remap_local_route_to_global(
        [0, 1, 3, 2, 0],
        customer_globals=[10, 20],
        local_landfill=3,
        landfill_global=99,
    )
    assert remapped == [0, 10, 99, 20, 0]


def test_extract_node_submatrix():
    matrix = [
        [0.0, 1.0, 2.0, 9.0],
        [1.0, 0.0, 3.0, 8.0],
        [2.0, 3.0, 0.0, 7.0],
        [9.0, 8.0, 7.0, 0.0],
    ]
    sub = _extract_node_submatrix(matrix, [0, 2, 3])
    assert sub == [
        [0.0, 2.0, 9.0],
        [2.0, 0.0, 7.0],
        [9.0, 7.0, 0.0],
    ]


def test_baseline_routes_partitioned_keeps_vehicle_alignment():
    dist = [
        [0.0, 10.0, 20.0, 30.0],
        [10.0, 0.0, 15.0, 25.0],
        [20.0, 15.0, 0.0, 12.0],
        [30.0, 25.0, 12.0, 0.0],
    ]
    time = dist
    solution = _baseline_routes_partitioned([[1], [], [2]], dist, time)
    assert solution.vehicle_routes == [[0, 1, 0], [0, 0], [0, 2, 0]]
    assert solution.distance_m == 60.0


def test_optimize_by_sector_assignment_keeps_points_on_own_vehicle():
    customers = [
        _customer(1, "A", sector_id=10),
        _customer(2, "B", sector_id=20),
        _customer(3, "C", sector_id=10),
    ]
    vehicles = [_unit(1, driver_id=100), _unit(2, driver_id=200)]
    assigned = [[1, 3], [2]]
    n = 5
    dist = [[float(abs(i - j) * 50) for j in range(n)] for i in range(n)]
    time = [[float(abs(i - j) * 10) for j in range(n)] for i in range(n)]

    solution = _optimize_by_sector_assignment(
        customers,
        vehicles,
        assigned,
        [],
        dist,
        time,
        shift_budget_sec=50_000.0,
        unload_sec=60.0,
        service_secs=[120.0, 120.0],
        aco_ants=4,
        aco_iterations=5,
    )

    assert len(solution.vehicle_routes) == 2
    route_a = [idx for idx in solution.vehicle_routes[0] if idx in {1, 2, 3}]
    route_b = [idx for idx in solution.vehicle_routes[1] if idx in {1, 2, 3}]
    assert set(route_a) == {1, 3}
    assert set(route_b) == {2}
    assert 2 not in route_a
    assert 1 not in route_b and 3 not in route_b


def test_supersede_daily_plan_optimized_routes_marks_pending_and_completed():
    pending = SimpleNamespace(status="pending", daily_plan_id=3, route_kind="optimized")
    completed = SimpleNamespace(status="completed", daily_plan_id=3, route_kind="optimized")
    in_progress = SimpleNamespace(status="in_progress", daily_plan_id=3, route_kind="optimized")
    db = MagicMock()
    # La query filtra pending/completed; simulamos que solo esas vuelven.
    db.scalars.return_value.all.return_value = [pending, completed]

    count = _supersede_daily_plan_optimized_routes(db, 3)

    assert count == 2
    assert pending.status == "superseded"
    assert completed.status == "superseded"
    assert in_progress.status == "in_progress"
    db.flush.assert_called_once()
