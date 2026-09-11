"""Reporte previsto vs. real con causa de contingencia (Fase 5)."""

from __future__ import annotations

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.planning_analytics_service import plan_vs_real_csv, plan_vs_real_report


def _plan(plan_id: int, op_date: date, *, actual: dict | None, planned: dict | None = None):
    return SimpleNamespace(
        id=plan_id,
        operation_date=op_date,
        status="completed",
        actual_kpis_json=json.dumps(actual) if actual is not None else None,
        planned_kpis_json=json.dumps(planned) if planned else None,
    )


def test_report_computes_deviations_and_cause():
    db = MagicMock()
    plan = _plan(
        2,
        date(2026, 9, 14),
        actual={
            "plannedDistanceKm": 40.0,
            "actualDistanceKm": 44.0,
            "plannedDurationMin": 300,
            "actualDurationMin": 330,
            "scheduledPoints": 10,
            "servedPoints": 9,
            "completionPct": 90.0,
            "collectedKg": 500.0,
        },
    )
    db.scalars.return_value.all.return_value = [plan]
    incident = SimpleNamespace(
        id=7, incident_type="breakdown", description="Avería", reported_at=None
    )
    vehicle = SimpleNamespace(code="TR-01")
    db.execute.return_value.all.return_value = [(2, incident, vehicle)]

    report = plan_vs_real_report(db, week_from=date(2026, 9, 14), week_to=date(2026, 9, 14))

    assert report["summary"]["days"] == 1
    assert report["summary"]["avgDistanceDeviationPct"] == 10.0
    assert report["summary"]["avgCompletionPct"] == 90.0
    assert report["summary"]["daysWithIncidents"] == 1
    item = report["items"][0]
    assert item["distanceDeviationKm"] == 4.0
    assert item["cause"] == "breakdown"
    assert item["incidents"][0]["vehicleId"] == "TR-01"


def test_report_without_actual_distance_has_no_deviation():
    db = MagicMock()
    plan = _plan(
        3,
        date(2026, 9, 15),
        actual={
            "plannedDistanceKm": 30.0,
            "actualDistanceKm": None,
            "scheduledPoints": 5,
            "servedPoints": 5,
            "completionPct": 100.0,
            "collectedKg": 0.0,
        },
    )
    db.scalars.return_value.all.return_value = [plan]
    db.execute.return_value.all.return_value = []

    report = plan_vs_real_report(db, week_from=date(2026, 9, 15), week_to=date(2026, 9, 15))

    assert report["items"][0]["distanceDeviationPct"] is None
    assert report["summary"]["avgDistanceDeviationPct"] is None
    assert report["items"][0]["cause"] == "none"


def test_csv_export_includes_header_and_rows():
    items = [
        {
            "operationDate": "2026-09-14",
            "weekStartDate": "2026-09-14",
            "status": "completed",
            "plannedDistanceKm": 40.0,
            "actualDistanceKm": 44.0,
            "distanceDeviationKm": 4.0,
            "distanceDeviationPct": 10.0,
            "plannedDurationMin": 300,
            "actualDurationMin": 330,
            "scheduledPoints": 10,
            "servedPoints": 9,
            "completionPct": 90.0,
            "collectedKg": 500.0,
            "cause": "breakdown",
            "incidents": [{"incidentType": "breakdown", "vehicleId": "TR-01"}],
        }
    ]

    csv_text = plan_vs_real_csv(items)
    lines = csv_text.strip().splitlines()

    assert lines[0].startswith("fecha,")
    assert "2026-09-14" in lines[1]
    assert "breakdown:TR-01" in lines[1]
