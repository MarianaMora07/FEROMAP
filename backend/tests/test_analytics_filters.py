"""Tests de filtros analíticos y agregación por granularidad."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.analytics_filters import (
    bucket_evolution_series,
    build_filters,
    hourly_distribution_from_rows,
    load_simulation_rows,
)
from app.services.analytics_service import analytics_heatmap


def _simulation(
    sim_id: int,
    *,
    executed_at: datetime,
    containers: int = 10,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=sim_id,
        executed_at=executed_at,
        scenario_name=f"Sim {sim_id}",
        parameters_json='{"kpis": {"containersServed": '
        + str(containers)
        + '}}',
        kpi_total_distance_historical=Decimal("30"),
        kpi_total_distance_optimized=Decimal("20"),
        kpi_saving_percentage=Decimal("25"),
    )


def test_build_filters_parses_dates_and_granularity():
    filters = build_filters(
        from_date="2026-06-01",
        to_date="2026-06-25",
        granularity="weekly",
        sector=" Unare I ",
    )
    assert filters.date_from is not None
    assert filters.date_to is not None
    assert filters.granularity == "weekly"
    assert filters.sector == "Unare I"


def test_bucket_evolution_series_groups_by_day():
    rows = [
        {
            "id": 1,
            "executedAt": "2026-06-01T08:00:00+00:00",
            "containersServed": 10,
            "distanceOptimizedKm": 12.0,
            "savingPercentage": 20.0,
        },
        {
            "id": 2,
            "executedAt": "2026-06-01T14:00:00+00:00",
            "containersServed": 5,
            "distanceOptimizedKm": 8.0,
            "savingPercentage": 30.0,
        },
        {
            "id": 3,
            "executedAt": "2026-06-02T09:00:00+00:00",
            "containersServed": 8,
            "distanceOptimizedKm": 10.0,
            "savingPercentage": 25.0,
        },
    ]

    series = bucket_evolution_series(rows, "daily")

    assert len(series["labels"]) == 2
    assert series["collections"] == [15, 8]
    assert series["distanceKm"] == [20.0, 10.0]


def test_hourly_distribution_from_rows_uses_execution_hour():
    rows = [
        {"executedAt": "2026-06-01T08:00:00+00:00", "containersServed": 4},
        {"executedAt": "2026-06-01T08:30:00+00:00", "containersServed": 2},
        {"executedAt": "2026-06-01T10:00:00+00:00", "containersServed": 3},
    ]

    hourly = hourly_distribution_from_rows(rows)

    assert hourly["recolecciones"][2] == 6
    assert hourly["recolecciones"][4] == 3


def test_load_simulation_rows_filters_by_date_range():
    db = SimpleNamespace()
    rows = [
        _simulation(1, executed_at=datetime(2026, 6, 1, tzinfo=timezone.utc)),
        _simulation(2, executed_at=datetime(2026, 6, 20, tzinfo=timezone.utc)),
        _simulation(3, executed_at=datetime(2026, 7, 1, tzinfo=timezone.utc)),
    ]

    class _Scalars:
        def __init__(self, stmt):
            self.stmt = stmt

        def all(self):
            start = end = None
            for criterion in getattr(self.stmt, "_where_criteria", ()):
                left = getattr(criterion, "left", None)
                right = getattr(criterion, "right", None)
                if getattr(left, "key", None) == "executed_at" and right is not None:
                    value = getattr(right, "value", right)
                    op = getattr(criterion, "operator", None)
                    if op.__name__ == "ge":
                        start = value
                    elif op.__name__ == "le":
                        end = value
            filtered = []
            for row in rows:
                ts = row.executed_at
                if start is not None and ts < start:
                    continue
                if end is not None and ts > end:
                    continue
                filtered.append(row)
            return filtered

    db.scalars = lambda stmt: _Scalars(stmt)

    filters = build_filters(from_date="2026-06-01", to_date="2026-06-25")
    parsed = load_simulation_rows(db, filters)

    assert len(parsed) == 2
    assert {row["id"] for row in parsed} == {1, 2}


def test_analytics_heatmap_returns_weighted_geojson():
    db = SimpleNamespace()

    class _Scalars:
        def all(self):
            return []

    db.scalars = lambda _stmt: _Scalars()

    point = SimpleNamespace(
        code="CNT-001",
        sector_id=1,
        sector=SimpleNamespace(name="Unare I"),
        max_capacity_kg=Decimal("1000"),
        current_fill_level_kg=Decimal("800"),
        last_emptied_at=None,
        latitude=Decimal("8.298"),
        longitude=Decimal("-62.724"),
    )

    from unittest.mock import patch

    with patch(
        "app.services.analytics_service.collection_points_geojson",
        return_value={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"fillLevel": 80, "sector": "Unare I"},
                    "geometry": {"type": "Point", "coordinates": [-62.724, 8.298]},
                }
            ],
        },
    ):
        geo = analytics_heatmap(db, build_filters(from_date="2026-06-01", to_date="2026-06-25"))

    assert geo["type"] == "FeatureCollection"
    assert geo["features"][0]["properties"]["weight"] > 0
