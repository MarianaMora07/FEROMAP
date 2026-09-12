"""Tests del KPI de riesgo de calendario (Fase 6)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.domain.criticality import hours_until_next_visit, is_at_risk_before_next_visit
from app.services import dashboard_service


def _point(
    *,
    point_id: int = 1,
    code: str = "CNT-001",
    fill_kg: float = 600.0,
    capacity: float = 1000.0,
    hours: float = 100.0,
    status: str = "active",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=point_id,
        code=code,
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(fill_kg)),
        estimated_fill_hours=hours,
        last_emptied_at=None,
        status=status,
        sector=SimpleNamespace(name="Unare I", id=1),
    )


# --- hours_until_next_visit ---------------------------------------------------


def test_hours_until_next_visit_same_day():
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)  # lunes
    assert hours_until_next_visit(weekdays=[0], at=at) == 7.0


def test_hours_until_next_visit_rolls_to_next_week():
    at = datetime(2026, 9, 7, 8, 0, tzinfo=timezone.utc)  # lunes tras las 07:00
    assert hours_until_next_visit(weekdays=[0], at=at) == 167.0


def test_hours_until_next_visit_none_without_weekdays():
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)
    assert hours_until_next_visit(weekdays=[], at=at) is None


# --- is_at_risk_before_next_visit --------------------------------------------


def test_risk_false_when_visit_comes_first():
    # huc = (800-600)/10 = 20 h; próxima visita en 10 h → no en riesgo.
    assert is_at_risk_before_next_visit(_point(), next_visit_hours=10.0) is False


def test_risk_true_when_critical_before_visit():
    assert is_at_risk_before_next_visit(_point(), next_visit_hours=30.0) is True


def test_risk_false_without_schedule():
    # Sin agenda no se puede evaluar "antes de la próxima visita" (no es riesgo de rebose).
    assert is_at_risk_before_next_visit(_point(), weekdays=[]) is False


def test_risk_true_when_visit_is_distant():
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)  # lunes
    # Próxima visita el domingo 07:00 (≈151 h) > huc 20 h → se llenará antes.
    assert is_at_risk_before_next_visit(_point(), weekdays=[6], at=at) is True


def test_risk_uses_weekdays_when_hours_not_given():
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)  # lunes 00:00 → 7 h
    # 60 % → huc 20 h > 7 h → no en riesgo.
    assert is_at_risk_before_next_visit(_point(), weekdays=[0], at=at) is False
    # 95 % → huc 0 → ya se llenará antes de la visita.
    assert is_at_risk_before_next_visit(_point(fill_kg=950.0), weekdays=[0], at=at) is True


# --- dashboard_summary: KPI aditivo ------------------------------------------


def _dashboard_db(points, schedules):
    db = MagicMock()
    # `_today_route_counts` consulta el plan de hoy con `db.scalar`; en una BD
    # fresca no hay plan → (0, 0), sin consumir un `db.scalars` extra.
    db.scalar.return_value = None
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=points)),
        MagicMock(all=MagicMock(return_value=schedules)),
        MagicMock(all=MagicMock(return_value=[])),  # vehicles
        MagicMock(all=MagicMock(return_value=[])),  # optimized routes
    ]
    return db


def test_dashboard_exposes_at_risk_without_changing_critical():
    points = [
        _point(point_id=1, code="CNT-001", fill_kg=950.0),  # crítico ahora y en riesgo
        _point(point_id=2, code="CNT-002", fill_kg=300.0),  # no crítico
    ]
    schedules = [
        SimpleNamespace(collection_point_id=1, weekdays_json="[0, 1, 2, 3, 4]"),
        SimpleNamespace(collection_point_id=2, weekdays_json="[0, 1, 2, 3, 4]"),
    ]
    db = _dashboard_db(points, schedules)

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
        summary = dashboard_service.dashboard_summary(db)

    metrics = summary["metrics"]
    assert metrics["totalContainers"] == 2
    # KPI principal intacto: estado (>= 80 %).
    assert metrics["criticalContainers"] == 1
    # KPI nuevo, aditivo.
    assert metrics["atRiskContainers"] >= 1
    assert {item["id"] for item in summary["atRiskContainers"]} >= {"CNT-001"}

    at_risk_metric = next(m for m in summary["mapMetrics"] if m["id"] == "at_risk")
    assert at_risk_metric["value"] == metrics["atRiskContainers"]

    critical_metric = next(m for m in summary["mapMetrics"] if m["id"] == "critical")
    assert critical_metric["value"] == 1
