"""Tests unitarios del reporte de optimización (sin BD)."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.optimization_report_service import (
    assess_convergence,
    build_driver_plan_rows,
    build_optimization_report,
    is_plausible_daily_optimization_kpis,
)


def test_is_plausible_daily_optimization_kpis():
    kpis = {
        "distanceKm": {"current": 30, "optimized": 22},
        "durationHours": {"current": 3, "optimized": 2},
    }
    assert is_plausible_daily_optimization_kpis(kpis, 12) is True
    assert is_plausible_daily_optimization_kpis(
        {
            "distanceKm": {"current": 19771, "optimized": 19771},
            "durationHours": {"current": 791, "optimized": 791},
        },
        3,
    ) is False


def test_assess_convergence_improves():
    metrics = {
        "acoConvergence": [
            {"iteration": 1, "bestDistanceKm": 30.0, "iterationBestDistanceKm": 30.0},
            {"iteration": 2, "bestDistanceKm": 28.5, "iterationBestDistanceKm": 28.5},
            {"iteration": 3, "bestDistanceKm": 27.2, "iterationBestDistanceKm": 27.5},
        ],
        "acoStoppedEarly": False,
        "acoIterationsRun": 3,
    }
    result = assess_convergence(metrics)
    assert result["ok"] is True
    assert result["improvement_pct"] == 9.3


def test_build_optimization_report_markdown_table():
    route = SimpleNamespace(
        id=101,
        driver_id=1,
        vehicle_id=2,
        status="pending",
        total_distance_meters=12500,
        estimated_duration_seconds=7200,
        driver=SimpleNamespace(first_name="Juan", last_name="Pérez"),
        vehicle=SimpleNamespace(code="TR-01"),
        waypoints=[
            SimpleNamespace(
                sequence_order=1,
                waypoint_type="collection",
                collection_point=SimpleNamespace(code="C001"),
            ),
            SimpleNamespace(
                sequence_order=2,
                waypoint_type="landfill",
                collection_point=None,
            ),
        ],
    )
    result = {
        "simulationId": 55,
        "scenarioId": "normal",
        "servedPointCodes": ["C001"],
        "engineMetrics": {
            "acoConvergence": [
                {"iteration": 1, "bestDistanceKm": 14.0, "iterationBestDistanceKm": 14.0},
                {"iteration": 2, "bestDistanceKm": 12.5, "iterationBestDistanceKm": 12.5},
            ],
            "acoIterationsRun": 2,
            "acoStoppedEarly": False,
        },
        "kpis": {
            "distanceKm": {"current": 15.0, "optimized": 12.5},
            "durationHours": {"current": 2.0, "optimized": 1.8},
            "co2KgAvoided": 1.2,
            "uncoveredPoints": 0,
        },
    }
    rows = build_driver_plan_rows([route])
    report = build_optimization_report(result, [route])

    assert len(rows) == 1
    assert rows[0].vehicle_code == "TR-01"
    assert "Plan del día por conductor" in report.markdown
    assert "Duración max ruta" in report.markdown
    assert "TR-01" in report.markdown
    assert "Juan Pérez" in report.markdown
