"""Serialización de features por vehículo a modelos de playback (simulación de día).

Cubre `route_feature_to_playback_model` y `route_features_to_playback_models`,
usados por el dry-run de contingencias para animar el plan alternativo.
"""

from __future__ import annotations

from typing import Any

from app.services.route_playback_service import (
    route_feature_to_playback_model,
    route_features_to_playback_models,
)


def _feature(label: str = "Ruta optimizada (IA)", feature_id: str = "route-optimized") -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {
            "id": feature_id,
            "type": "optimized",
            "label": label,
            "distanceKm": 12.4,
            "durationMin": 48,
            # El motor no emite serviceMinutes: debe rellenarse en la serialización.
            "stops": [
                {"sequence": 1, "lng": -62.71, "lat": 8.29, "code": "CNT-001", "stopType": "collection"},
                {"sequence": 2, "lng": -62.72, "lat": 8.30, "code": "VERTEDERO", "stopType": "landfill"},
            ],
        },
        "geometry": {"type": "LineString", "coordinates": [[-62.70, 8.20], [-62.71, 8.29]]},
    }


def test_route_feature_to_playback_model_fills_service_minutes():
    model = route_feature_to_playback_model(_feature(), "#34D634", route_id=1)

    assert model is not None
    assert model["routeId"] == 1
    assert model["vehicleId"] == 1
    assert model["vehicleLabel"] == "Ruta optimizada (IA)"
    assert model["color"] == "#34D634"
    assert model["lineCoordinates"] == [[-62.70, 8.20], [-62.71, 8.29]]
    assert len(model["stops"]) == 2
    assert all(stop["serviceMinutes"] > 0 for stop in model["stops"])
    assert model["stops"][0]["stopType"] == "collection"
    assert model["stops"][1]["stopType"] == "landfill"
    assert model["totalDurationMinutes"] == 48
    assert model["distanceKm"] == 12.4
    assert model["startTime"] is None


def test_route_feature_to_playback_model_infers_landfill_type_from_code():
    feature = _feature()
    for stop in feature["properties"]["stops"]:
        stop.pop("stopType", None)
    model = route_feature_to_playback_model(feature, "#000")
    assert model is not None
    assert model["stops"][1]["stopType"] == "landfill"


def test_route_feature_to_playback_model_rejects_short_geometry():
    feature = _feature()
    feature["geometry"] = {"type": "LineString", "coordinates": [[-62.70, 8.20]]}
    assert route_feature_to_playback_model(feature, "#000") is None


def test_route_feature_to_playback_model_rejects_feature_without_stops():
    feature = _feature()
    feature["properties"]["stops"] = []
    assert route_feature_to_playback_model(feature, "#000") is None


def test_route_feature_to_playback_model_prefers_vehicle_code():
    feature = _feature()
    feature["properties"]["vehicleCode"] = "TR-03"

    model = route_feature_to_playback_model(feature, "#000")

    assert model is not None
    assert model["vehicleLabel"] == "TR-03"


def test_route_features_to_playback_models_assigns_unique_ids_and_colors():
    models = route_features_to_playback_models(
        [_feature("A"), _feature("B", feature_id="route-optimized-v2")]
    )

    assert [model["routeId"] for model in models] == [1, 2]
    assert [model["vehicleLabel"] for model in models] == ["A", "B"]
    assert models[0]["color"] != models[1]["color"]
