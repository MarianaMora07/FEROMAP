"""Tests de export y comparativas por corrida (Tarea 5)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from app.services.dashboard_service import (
    build_simulation_comparison_csv,
    build_simulation_comparison_pdf,
    _comparison_metrics,
)


def _simulation() -> object:
    return type(
        "Simulation",
        (),
        {
            "id": 7,
            "scenario_name": "Tráfico normal",
            "executed_at": datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc),
            "parameters_json": json.dumps(
                {
                    "scenarioId": "normal",
                    "kpis": {
                        "distanceKm": {"current": 100.0, "optimized": 80.0},
                        "durationHours": {"current": 8.0, "optimized": 6.5},
                        "fuelLiters": {"optimized": 28.0},
                        "co2KgAvoided": 12.5,
                        "containersServed": 42,
                    },
                }
            ),
            "kpi_total_distance_historical": Decimal("100.00"),
            "kpi_total_distance_optimized": Decimal("80.00"),
            "kpi_saving_percentage": Decimal("20.00"),
            "case_study_id": None,
        },
    )()


def test_comparison_metrics_reads_columns_and_kpis():
    metrics = _comparison_metrics(_simulation())
    assert metrics["distanceCurrentKm"] == 100.0
    assert metrics["distanceOptimizedKm"] == 80.0
    assert metrics["savingPct"] == 20.0
    assert metrics["durationOptimizedHours"] == 6.5
    assert metrics["co2KgAvoided"] == 12.5
    assert metrics["containersServed"] == 42


def test_comparison_csv_contains_table_and_methodology_note():
    csv_text = build_simulation_comparison_csv(_simulation())
    assert "# Simulación,7" in csv_text
    assert "línea base sintética" in csv_text
    assert "metrica,actual,ia,unidad" in csv_text
    assert "distancia,100.00,80.00,km" in csv_text
    assert "ahorro,20.00%," in csv_text or "ahorro,,20.00%" in csv_text


def test_comparison_pdf_starts_with_pdf_header():
    pdf = build_simulation_comparison_pdf(_simulation())
    assert pdf.startswith(b"%PDF")
