"""KPIs agregados por rol en el dashboard (F6)."""

from __future__ import annotations

from app.services.dashboard_service import role_kpis

_KW = dict(
    total_containers=20,
    critical=3,
    at_risk=2,
    active_vehicles=4,
    routes_in_progress=1,
    routes_completed=2,
    routes_planned=5,
)


def test_planner_kpis_highlight_critical_and_completion():
    items = role_kpis("planificador", **_KW)

    assert [item["id"] for item in items] == ["critical", "at_risk", "completed"]
    assert next(item for item in items if item["id"] == "critical")["value"] == 3


def test_admin_kpis_highlight_fleet_and_planning():
    items = role_kpis("administrador", **_KW)

    assert [item["id"] for item in items] == ["containers", "vehicles", "routes"]
    assert next(item for item in items if item["id"] == "vehicles")["value"] == 4


def test_operator_and_resident_kpis():
    assert [item["id"] for item in role_kpis("conductor", **_KW)] == ["routes", "critical"]
    assert [item["id"] for item in role_kpis("residente", **_KW)] == ["containers", "critical"]


def test_unknown_role_returns_empty():
    assert role_kpis(None, **_KW) == []
