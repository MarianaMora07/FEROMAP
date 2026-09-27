"""Tests del KPI de riesgo de calendario (Fase 6)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

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


def test_hours_until_next_visit_uses_local_collection_hour():
    # Lunes 00:00 UTC = domingo 20:00 en Caracas: la visita del lunes a las
    # 07:00 locales cae a las 11:00 UTC, es decir 11 h después.
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)
    assert hours_until_next_visit(weekdays=[0], at=at) == 11.0


def test_hours_until_next_visit_rolls_to_next_week():
    # Lunes 12:00 UTC = lunes 08:00 local: la hora de recolección ya pasó.
    at = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
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
    # Próxima visita el domingo 07:00 local (≈155 h) > huc 20 h → se llenará antes.
    assert is_at_risk_before_next_visit(_point(), weekdays=[6], at=at) is True


def test_risk_uses_weekdays_when_hours_not_given():
    at = datetime(2026, 9, 7, 0, 0, tzinfo=timezone.utc)  # lunes 00:00 → 11 h
    # 60 % → huc 20 h > 11 h → no en riesgo.
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
        MagicMock(all=MagicMock(return_value=[])),  # días de plan semanal
        MagicMock(all=MagicMock(return_value=schedules)),
        MagicMock(all=MagicMock(return_value=[])),  # vehicles
        MagicMock(all=MagicMock(return_value=[])),  # optimized routes
    ]
    return db


@pytest.fixture
def dashboard_patches():
    """Aísla ``dashboard_summary`` de flota, alertas y optimizaciones."""
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
        yield


def test_dashboard_reports_at_risk_coverage(dashboard_patches):
    """Los contenedores sin plan ni agenda no se inventan: se reportan aparte."""
    points = [
        _point(point_id=1, code="CNT-001", fill_kg=950.0),  # crítico → fuera
        _point(point_id=2, code="CNT-002", fill_kg=300.0),  # evaluable (tiene agenda)
        _point(point_id=3, code="CNT-003", fill_kg=300.0),  # sin agenda ni plan
    ]
    schedules = [SimpleNamespace(collection_point_id=2, weekdays_json="[0, 1, 2, 3, 4]")]
    db = _dashboard_db(points, schedules)

    metrics = dashboard_service.dashboard_summary(db)["metrics"]

    assert metrics["atRiskEvaluable"] == 1
    assert metrics["atRiskUnevaluated"] == 1


def test_dashboard_at_risk_and_critical_are_complementary(dashboard_patches):
    """El riesgo de calendario excluye lo que ya es crítico (cubos disjuntos)."""
    points = [
        _point(point_id=1, code="CNT-001", fill_kg=950.0),  # crítico ahora
        _point(point_id=2, code="CNT-002", fill_kg=300.0),  # aún no crítico
    ]
    schedules = [
        SimpleNamespace(collection_point_id=1, weekdays_json="[0, 1, 2, 3, 4]"),
        SimpleNamespace(collection_point_id=2, weekdays_json="[0, 1, 2, 3, 4]"),
    ]
    db = _dashboard_db(points, schedules)

    with patch.object(
        dashboard_service,
        "is_at_risk_before_next_visit",
        lambda point, *, next_visit_hours: True,
    ):
        summary = dashboard_service.dashboard_summary(db)

    metrics = summary["metrics"]
    assert metrics["totalContainers"] == 2
    # KPI principal intacto: estado (>= 80 %).
    assert metrics["criticalContainers"] == 1

    critical_ids = {item["id"] for item in summary["criticalContainerList"]}
    at_risk_ids = {item["id"] for item in summary["atRiskContainers"]}
    assert critical_ids == {"CNT-001"}
    assert at_risk_ids == {"CNT-002"}
    assert not (critical_ids & at_risk_ids)
    assert metrics["atRiskContainers"] == 1

    at_risk_metric = next(m for m in summary["mapMetrics"] if m["id"] == "at_risk")
    assert at_risk_metric["value"] == metrics["atRiskContainers"]

    critical_metric = next(m for m in summary["mapMetrics"] if m["id"] == "critical")
    assert critical_metric["value"] == 1
