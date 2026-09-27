"""Contrato de criticidad (Fase 0).

Tests de **caracterización**: congelan el comportamiento actual de los conteos
de criticidad para que las fases posteriores (ver ``docs/fase-0/adr-criticidad.md``)
no cambien respuestas de forma silenciosa.

Si alguno falla durante la migración, es una señal intencional: actualiza el test
y documenta el cambio de semántica en el ADR.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import config
from app.config import CRITICALITY_MODELS, DEFAULT_CRITICALITY_MODEL, resolve_criticality_model
from app.db.models import UserRole
from app.services import dashboard_service
from app.services.collection_point_service import (
    collection_points_optimization_context,
    fill_status_from_level,
)
from app.services.optimization_service import CustomerNode, _critical_coverage_pct


def _point(
    code: str,
    *,
    point_id: int = 1,
    sector_id: int = 1,
    sector_name: str = "Unare I",
    fill_pct: float = 50.0,
    capacity: float = 1000.0,
    status: str = "active",
    priority_boost: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=point_id,
        code=code,
        sector_id=sector_id,
        sector=SimpleNamespace(name=sector_name, id=sector_id),
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(capacity * fill_pct / 100)),
        status=status,
        deleted_at=None,
        last_emptied_at=None,
        latitude=Decimal("8.298"),
        longitude=Decimal("-72.724"),
        road_node_id=None,
        priority_boost=priority_boost,
    )


# --- Flag CRITICALITY_MODEL ---------------------------------------------------


def test_criticality_model_defaults_to_state():
    assert DEFAULT_CRITICALITY_MODEL == "state"
    assert resolve_criticality_model(None) in CRITICALITY_MODELS
    assert config.settings.criticality_model in CRITICALITY_MODELS


def test_resolve_criticality_model_normalizes_and_falls_back():
    assert resolve_criticality_model("state") == "state"
    assert resolve_criticality_model("RISK") == "risk"
    assert resolve_criticality_model(" risk ") == "risk"
    # Valores inválidos caen al default seguro.
    assert resolve_criticality_model("bogus") == "state"
    assert resolve_criticality_model("") == "state"


# --- dashboard_summary().metrics ---------------------------------------------


def _dashboard_db(points: list[SimpleNamespace]) -> MagicMock:
    db = MagicMock()
    db.scalars.return_value.all.return_value = points
    return db


def test_dashboard_summary_metrics_are_frozen():
    """Congela los umbrales de estado: crítico >= 80 %, lleno >= 60 %."""
    points = [
        _point("CNT-001", fill_pct=85),  # crítico + lleno
        _point("CNT-002", fill_pct=80),  # crítico + lleno (borde)
        _point("CNT-003", fill_pct=79),  # no crítico + lleno
        _point("CNT-004", fill_pct=60),  # lleno (borde)
        _point("CNT-005", fill_pct=59),  # ni crítico ni lleno
    ]
    db = _dashboard_db(points)

    with (
        patch.object(dashboard_service, "fleet_summary", return_value={"activeVehicles": 2, "totalVehicles": 3, "driversOnShift": 2}),
        patch.object(dashboard_service, "seed_meta_by_code", return_value={}),
        patch.object(dashboard_service, "_latest_optimization", return_value=None),
        patch.object(dashboard_service, "_fleet_status_breakdown", return_value={}),
        patch.object(dashboard_service, "active_routes_view", return_value=[]),
        patch.object(dashboard_service, "_weekly_tons_from_simulations", return_value={"labels": [], "values": []}),
        patch.object(dashboard_service, "_recent_alerts_view", return_value=[]),
        patch.object(dashboard_service, "planning_dashboard_snapshot", return_value={}),
    ):
        summary = dashboard_service.dashboard_summary(db)

    metrics = summary["metrics"]
    assert metrics["totalContainers"] == 5
    assert metrics["criticalContainers"] == 2
    assert metrics["fullContainers"] == 4
    assert metrics["activeVehicles"] == 2

    assert summary["notifications"] == 2
    assert len(summary["criticalContainerList"]) == 2
    assert {item["id"] for item in summary["criticalContainerList"]} == {"CNT-001", "CNT-002"}

    critical_metric = next(m for m in summary["mapMetrics"] if m["id"] == "critical")
    assert critical_metric["value"] == 2
    full_metric = next(m for m in summary["mapMetrics"] if m["id"] == "full")
    assert full_metric["value"] == 4


# --- collection_points_optimization_context() --------------------------------


def test_collection_points_optimization_context_freezes_counts():
    """Fase 2: el contexto usa el umbral unificado (crítico >= 80 %)."""
    db = MagicMock()
    admin = SimpleNamespace(role=UserRole.administrador, sector_id=None)
    points = [
        _point("CNT-001", fill_pct=95),  # > 90 → crítico
        _point("CNT-002", fill_pct=50, priority_boost=True),
        _point("CNT-003", fill_pct=92, status="inactive"),  # inactivo → no cuenta
    ]

    latest_at = datetime.now(timezone.utc)
    route = SimpleNamespace(
        calculated_at=latest_at,
        waypoints=[SimpleNamespace(collection_point=SimpleNamespace(code="CNT-001"))],
    )

    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=points)),
        MagicMock(unique=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[route])))),
        MagicMock(all=MagicMock(return_value=[])),
    ]
    db.scalar.return_value = latest_at

    context = collection_points_optimization_context(db, admin)

    assert context["criticalCount"] == 1
    assert context["priorityBoostCodes"] == ["CNT-002"]
    assert context["lastOptimizedCodes"] == ["CNT-001"]
    assert context["lastOptimizedAt"] is not None
    assert context["overloadedCodes"] == []


# --- fill_status_from_level() ------------------------------------------------


def test_fill_status_from_level_buckets_are_frozen():
    """Cortes alineados a 80/60 en Fase 1 (antes >90 / >=70)."""
    assert fill_status_from_level(80) == "critico"
    assert fill_status_from_level(79) == "lleno"
    assert fill_status_from_level(60) == "lleno"
    assert fill_status_from_level(59) == "normal"
    assert fill_status_from_level(30) == "normal"
    assert fill_status_from_level(29) == "parcial"
    assert fill_status_from_level(0) == "parcial"
    assert fill_status_from_level(95, point_status="inactive") == "fueraDeServicio"


# --- _critical_coverage_pct() -------------------------------------------------


def _customer(code: str, fill_pct: int, order: int) -> CustomerNode:
    return CustomerNode(
        point_id=order,
        code=code,
        graph_node=order,
        demand_kg=float(fill_pct),
        fill_pct=fill_pct,
        lon=-72.7,
        lat=8.3,
        sector_id=1,
    )


def test_critical_coverage_pct_freezes_boundary_at_80():
    customers = [_customer("CNT-001", 90, 1), _customer("CNT-002", 80, 2), _customer("CNT-003", 79, 3)]

    # Dos críticos (>= 80); uno servido.
    assert _critical_coverage_pct(customers, {"CNT-001"}) == 50
    assert _critical_coverage_pct(customers, set()) == 0
    assert _critical_coverage_pct(customers, {"CNT-001", "CNT-002"}) == 100


def test_critical_coverage_pct_is_100_without_critical():
    customers = [_customer("CNT-001", 79, 1), _customer("CNT-002", 10, 2)]
    assert _critical_coverage_pct(customers, set()) == 100
