"""Agregado por zona del dashboard (panel "Zonas que requieren más atención")."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import dashboard_service


def _point(
    *,
    point_id: int,
    code: str,
    sector_name: str = "Unare I",
    fill_kg: float = 300.0,
    capacity: float = 1000.0,
    hours: float = 100.0,
    status: str = "active",
    emptied_hours_ago: float | None = None,
) -> SimpleNamespace:
    last_emptied = (
        datetime.now(timezone.utc) - timedelta(hours=emptied_hours_ago)
        if emptied_hours_ago is not None
        else None
    )
    return SimpleNamespace(
        id=point_id,
        code=code,
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(fill_kg)),
        estimated_fill_hours=hours,
        last_emptied_at=last_emptied,
        status=status,
        sector=SimpleNamespace(name=sector_name, id=1),
    )


def _summary(points: list[SimpleNamespace]) -> dict:
    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=points)),  # collection points
        MagicMock(all=MagicMock(return_value=[])),  # weekly plan days
        MagicMock(all=MagicMock(return_value=[])),  # visit schedules
        MagicMock(all=MagicMock(return_value=[])),  # vehicles
        MagicMock(all=MagicMock(return_value=[])),  # optimized routes
    ]

    with (
        patch.object(
            dashboard_service,
            "fleet_summary",
            return_value={"activeVehicles": 1, "totalVehicles": 1, "driversOnShift": 1},
        ),
        patch.object(dashboard_service, "seed_meta_by_code", return_value={}),
        patch.object(dashboard_service, "_latest_optimization", return_value=None),
        patch.object(dashboard_service, "_fleet_status_breakdown", return_value={}),
        patch.object(dashboard_service, "active_routes_view", return_value=[]),
        patch.object(
            dashboard_service,
            "_weekly_tons_from_simulations",
            return_value={"labels": [], "values": []},
        ),
        patch.object(dashboard_service, "_recent_alerts_view", return_value=[]),
        patch.object(dashboard_service, "planning_dashboard_snapshot", return_value={}),
    ):
        return dashboard_service.dashboard_summary(db)


def test_zone_aggregate_counts_critical_and_overflow():
    points = [
        # Vaciado hace 100 h con baseline de 72 h → proyecta rebose.
        _point(point_id=1, code="CNT-001", emptied_hours_ago=100, hours=72),
        _point(point_id=2, code="CNT-002", fill_kg=900),  # crítico, sin rebose
        _point(point_id=3, code="CNT-003", fill_kg=300),  # normal
        _point(point_id=4, code="CNT-004", sector_name="Curagua B", fill_kg=500),
    ]

    zones = {zone["name"]: zone for zone in _summary(points)["sectorFillLevels"]}

    assert zones["Unare I"]["criticalCount"] == 2
    assert zones["Unare I"]["overflowCount"] == 1
    assert zones["Unare I"]["pct"] == round((100 + 90 + 30) / 3)
    assert zones["Curagua B"]["criticalCount"] == 0
    assert zones["Curagua B"]["overflowCount"] == 0
    assert zones["Curagua B"]["pct"] == 50


def test_zone_aggregate_ignores_out_of_service_containers():
    points = [
        _point(point_id=1, code="CNT-001", fill_kg=900),
        _point(point_id=2, code="CNT-002", fill_kg=900, status="inactive"),
    ]

    zones = {zone["name"]: zone for zone in _summary(points)["sectorFillLevels"]}

    assert zones["Unare I"]["criticalCount"] == 1
    # Solo cuenta el contenedor activo: (90) / 1.
    assert zones["Unare I"]["pct"] == 90
