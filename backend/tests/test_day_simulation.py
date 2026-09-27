"""Tests de la simulación guionada del día (Fase 2).

La secuencia se computa con el dry-run real del motor, así que aquí se mockean los
cores para verificar el guion, el encadenamiento y la no-persistencia sin correr ACO.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import DailyPlan
from app.services.day_simulation_service import _stability_pct, build_day_simulation

PLAYBACK_DURATION_MINUTES = 5


def _plan() -> DailyPlan:
    plan = DailyPlan(operation_date=date(2026, 9, 14), status="dispatched", scenario_id="normal")
    plan.id = 2
    return plan


def _stop(sequence: int, code: str) -> dict[str, Any]:
    return {
        "sequence": sequence,
        "lng": -62.7,
        "lat": 8.2,
        "code": code,
        "serviceMinutes": 3,
        "stopType": "collection",
    }


def _playback_routes() -> list[dict[str, Any]]:
    return [
        {
            "routeId": 1,
            "vehicleId": 1,
            "vehicleLabel": "TR-01",
            "color": "#34D634",
            "lineCoordinates": [[-62.7, 8.2], [-62.71, 8.3]],
            "stops": [_stop(1, "CNT-001"), _stop(2, "CNT-002"), _stop(3, "CNT-003")],
            "totalDurationMinutes": 300,
            "distanceKm": 30.0,
            "startTime": None,
        },
        {
            "routeId": 2,
            "vehicleId": 2,
            "vehicleLabel": "TR-02",
            "color": "#1143F3",
            "lineCoordinates": [[-62.72, 8.21], [-62.73, 8.31]],
            "stops": [_stop(1, "CNT-010")],
            "totalDurationMinutes": 200,
            "distanceKm": 18.0,
            "startTime": None,
        },
    ]


def _breakdown_raw() -> dict[str, Any]:
    return {
        "resolution": "reassigned",
        "pendingPoints": 2,
        "alternativeRoutes": [{"routeId": 1, "stops": [{"code": "CNT-002"}]}],
        "comparison": {
            "beforeDistanceKm": 30.0,
            "afterDistanceKm": 28.0,
            "distanceDeltaKm": -2.0,
            "reassignedPoints": 2,
        },
        "droppedPoints": [],
        "droppedDetails": [],
        "message": "Simulación de avería en TR-01: 2 puntos se reasignarían.",
    }


def _critical_raw() -> dict[str, Any]:
    return {
        "resolution": "reassigned",
        "remainingPoints": 1,
        "alternativeRoutes": [{"routeId": 2, "stops": [{"code": "CNT-009"}]}],
        "recalculation": {"kpis": {"distanceKm": {"optimized": 25.0}}},
        "droppedPoints": [],
        "droppedDetails": [],
        "message": "Simulación: 1 punto se reoptimizaría incluyendo CNT-009.",
    }


def _db(plan: DailyPlan | None) -> MagicMock:
    db = MagicMock()
    db.get.return_value = plan
    return db


def _run(db: MagicMock):
    with (
        patch(
            "app.services.day_simulation_service.build_daily_route_playback",
            return_value={"routes": _playback_routes()},
        ),
        patch(
            "app.services.day_simulation_service._pick_critical_point_code",
            return_value="CNT-009",
        ),
        patch(
            "app.services.day_simulation_service.run_vehicle_breakdown_dry_run",
            return_value=_breakdown_raw(),
        ) as breakdown,
        patch(
            "app.services.day_simulation_service.run_critical_container_recalc_dry_run",
            return_value=_critical_raw(),
        ) as critical,
    ):
        result = build_day_simulation(db, 2)
    return result, breakdown, critical


def test_build_day_simulation_builds_ordered_steps_with_geometry():
    db = _db(_plan())
    result, breakdown, critical = _run(db)

    assert result["dailyPlanId"] == 2
    assert result["operationDate"] == "2026-09-14"
    # Jornada = la ruta más larga (300 min); objetivo de animación = 5 min.
    assert result["operationMinutes"] == 300
    assert result["playbackDurationMinutes"] == PLAYBACK_DURATION_MINUTES
    assert result["baseRoutes"] == _playback_routes()

    assert [step["id"] for step in result["steps"]] == ["step-1-breakdown", "step-2-critical"]
    first, second = result["steps"]
    # Evento 1 a ~35 % y evento 2 a ~70 % de la jornada.
    assert first["atMinutes"] == round(300 * 0.35)
    assert second["atMinutes"] == round(300 * 0.70)
    # Avería sobre el vehículo con más paradas.
    assert first["target"] == {"vehicleId": "TR-01"}
    assert second["target"] == {"pointCode": "CNT-009"}
    # Cada paso trae la geometría del plan alternativo.
    assert first["alternativeRoutes"] and second["alternativeRoutes"]
    assert first["resolution"] == "reassigned"
    assert second["resolution"] == "reassigned"

    # KPIs por paso (base = 4 paradas: 3 + 1 en `_playback_routes`).
    assert first["baseStops"] == 4
    assert first["reassignedPoints"] == 2
    assert first["stabilityPct"] == 50.0
    assert first["beforeDistanceKm"] == 30.0
    assert first["afterDistanceKm"] == 28.0
    assert first["distanceDeltaKm"] == -2.0
    # El paso 2 parte del plan alternativo del paso 1 (1 parada).
    assert second["baseStops"] == 1
    assert second["afterDistanceKm"] == 25.0
    # La estabilidad solo aplica a la avería (el crítico reoptimiza el resto).
    assert second["stabilityPct"] is None

    # El guion se apoya en los cores dry-run (el 2.º parte del 1.º en la sesión).
    breakdown.assert_called_once()
    critical.assert_called_once()
    assert breakdown.call_args.kwargs["vehicle_id"] == "TR-01"


def test_stability_pct_is_coherent():
    assert _stability_pct(0, 10) == 100.0
    assert _stability_pct(5, 10) == 50.0
    assert _stability_pct(20, 10) == 0.0
    assert _stability_pct(1, 0) is None


def test_build_day_simulation_is_deterministic():
    first_result, _, _ = _run(_db(_plan()))
    second_result, _, _ = _run(_db(_plan()))

    assert json.dumps(first_result, sort_keys=True) == json.dumps(second_result, sort_keys=True)


def test_build_day_simulation_does_not_persist():
    db = _db(_plan())
    _run(db)

    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_build_day_simulation_omits_events_without_routes():
    db = _db(_plan())
    with (
        patch(
            "app.services.day_simulation_service.build_daily_route_playback",
            return_value={"routes": []},
        ),
        patch(
            "app.services.day_simulation_service._pick_critical_point_code",
            return_value=None,
        ),
        patch(
            "app.services.day_simulation_service.run_vehicle_breakdown_dry_run"
        ) as breakdown,
    ):
        result = build_day_simulation(db, 2)

    assert result["baseRoutes"] == []
    assert result["steps"] == []
    assert result["operationMinutes"] == 720
    breakdown.assert_not_called()
    db.rollback.assert_called_once()


def test_build_day_simulation_rejects_unknown_plan():
    db = _db(None)
    with pytest.raises(HTTPException) as exc:
        build_day_simulation(db, 999)
    assert exc.value.status_code == 404
