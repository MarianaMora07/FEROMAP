"""Contratos de KPIs previsto/real (Fase 0)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.domain.plan_kpis import (
    aggregate_weekly_forecast,
    dump_kpi_json,
    forecast_from_routes,
    parse_kpi_json,
    plan_vs_real_from_routes,
)


def _route(distance_m: float, duration_s: int, *, waypoints: list | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        total_distance_meters=distance_m,
        estimated_duration_seconds=duration_s,
        waypoints=waypoints or [],
    )


def _waypoint(status: str, *, weight: float | None = None, arrival: datetime | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        status=status,
        collected_weight_kg=weight,
        actual_arrival_at=arrival,
    )


def test_forecast_from_routes_sums_distance_duration_and_vehicles():
    routes = [_route(14500, 260 * 60), _route(10500, 180 * 60)]
    forecast = forecast_from_routes(routes, scheduled_points=8)

    assert forecast["distanceKm"] == 25.0
    assert forecast["durationHours"] == 7.33
    assert forecast["vehicleCount"] == 2
    assert forecast["scheduledPoints"] == 8
    # Sin cobertura explícita y sin no-cubiertos: cobertura total.
    assert forecast["coveredPoints"] == 8
    assert forecast["coveragePct"] == 100.0


def test_forecast_saving_pct_uses_baseline():
    forecast = forecast_from_routes([_route(80000, 0)], scheduled_points=10, baseline_distance_km=100.0)
    assert forecast["baselineDistanceKm"] == 100.0
    assert forecast["savingPct"] == 20.0


def test_forecast_marks_uncovered_points():
    forecast = forecast_from_routes([_route(1000, 0)], scheduled_points=10, covered_points=7)
    assert forecast["coveredPoints"] == 7
    assert forecast["uncoveredPoints"] == 3
    assert forecast["coveragePct"] == 70.0


def test_plan_vs_real_counts_served_and_collected():
    routes = [
        _route(
            14500,
            0,
            waypoints=[
                _waypoint("completed", weight=120.5),
                _waypoint("pending", weight=None),
            ],
        ),
        _route(9000, 0, waypoints=[_waypoint("collected", weight=79.5)]),
    ]
    result = plan_vs_real_from_routes(routes, scheduled_points=4)

    assert result["plannedDistanceKm"] == 23.5
    assert result["servedPoints"] == 2
    assert result["collectedKg"] == 200.0
    assert result["scheduledPoints"] == 4
    assert result["completionPct"] == 50.0
    # La distancia real aún no se deriva (Fase 4).
    assert result["actualDistanceKm"] is None


def test_plan_vs_real_estimates_actual_duration_from_arrivals():
    base = datetime(2026, 9, 14, 6, 0, tzinfo=timezone.utc)
    routes = [
        _route(
            1000,
            0,
            waypoints=[
                _waypoint("completed", arrival=base),
                _waypoint("completed", arrival=base + timedelta(minutes=95)),
            ],
        )
    ]
    result = plan_vs_real_from_routes(routes, scheduled_points=2)
    assert result["actualDurationMin"] == 95.0


def test_aggregate_weekly_forecast_rolls_up_days():
    by_day = {
        "2026-09-14": forecast_from_routes([_route(40000, 0)], scheduled_points=10, baseline_distance_km=50.0),
        "2026-09-15": forecast_from_routes([_route(20000, 0)], scheduled_points=10, baseline_distance_km=25.0),
    }
    week = aggregate_weekly_forecast(by_day, week_start_date="2026-09-14", baseline_distance_km=75.0)

    assert week["weekStartDate"] == "2026-09-14"
    assert week["distanceKm"] == 60.0
    assert week["scheduledPoints"] == 20
    assert week["baselineDistanceKm"] == 75.0
    assert week["savingPct"] == 20.0
    assert set(week["days"]) == {"2026-09-14", "2026-09-15"}


def test_plan_vs_real_uses_provided_actual_distance():
    routes = [_route(10000, 0, waypoints=[])]
    result = plan_vs_real_from_routes(routes, scheduled_points=2, actual_distance_km=8.4)
    assert result["actualDistanceKm"] == 8.4
    assert result["plannedDistanceKm"] == 10.0


def test_parse_and_dump_kpi_json_round_trip():
    payload = {"distanceKm": 12.5, "vehicleCount": 2}
    raw = dump_kpi_json(payload)
    assert raw is not None
    assert parse_kpi_json(raw) == payload


def test_parse_kpi_json_rejects_invalid_values():
    assert parse_kpi_json(None) is None
    assert parse_kpi_json("") is None
    assert parse_kpi_json("{no-json") is None
    assert parse_kpi_json("[1, 2]") is None
    assert dump_kpi_json({}) is None
