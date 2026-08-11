"""Tests de contrato para parámetros de simulación y escenarios clave."""

from __future__ import annotations

import pytest

from app.services.scenario_parameters import (
    apply_simulation_parameter_modifiers,
    normalize_duration_hours,
    normalize_rain_intensity,
    normalize_waste_level_pct,
)

SCENARIO_BASE = {
    "normal": (1.0, 0.0),
    "peak_traffic": (1.35, 5.0),
    "rain": (1.2, 3.0),
    "saturated": (1.05, 15.0),
    "broken_vehicle": (1.1, 5.0),
}


@pytest.mark.parametrize("scenario_id", list(SCENARIO_BASE))
def test_base_scenario_modifiers_unchanged_without_optional_params(scenario_id: str) -> None:
    traffic, fill = SCENARIO_BASE[scenario_id]
    out_traffic, out_fill, applied = apply_simulation_parameter_modifiers(
        scenario_id,
        traffic,
        fill,
    )
    assert out_traffic == pytest.approx(traffic)
    assert out_fill == pytest.approx(fill)
    assert applied == {}


def test_rain_intensity_scales_traffic_only_for_rain_scenario() -> None:
    traffic, fill, applied = apply_simulation_parameter_modifiers(
        "rain",
        1.2,
        3.0,
        rain_intensity="alta",
    )
    assert traffic == pytest.approx(1.2 * 1.30)
    assert fill == pytest.approx(3.0)
    assert applied["rainIntensity"] == "alta"
    assert applied["rainTrafficFactor"] == 1.30


def test_rain_intensity_ignored_for_non_rain_scenario() -> None:
    traffic, fill, applied = apply_simulation_parameter_modifiers(
        "peak_traffic",
        1.35,
        5.0,
        rain_intensity="alta",
    )
    assert traffic == pytest.approx(1.35)
    assert applied == {}


@pytest.mark.parametrize(
    ("intensity", "factor"),
    [("baja", 1.05), ("media", 1.15), ("alta", 1.30)],
)
def test_rain_intensity_levels(intensity: str, factor: float) -> None:
    traffic, _, applied = apply_simulation_parameter_modifiers(
        "rain",
        1.0,
        0.0,
        rain_intensity=intensity,
    )
    assert traffic == pytest.approx(factor)
    assert applied["rainTrafficFactor"] == factor


def test_waste_level_boosts_fill_only_for_saturated_scenario() -> None:
    traffic, fill, applied = apply_simulation_parameter_modifiers(
        "saturated",
        1.05,
        15.0,
        waste_level_pct=30,
    )
    assert traffic == pytest.approx(1.05)
    assert fill == pytest.approx(45.0)
    assert applied["wasteLevelPct"] == 30


def test_waste_level_ignored_for_non_saturated_scenario() -> None:
    _, fill, applied = apply_simulation_parameter_modifiers(
        "normal",
        1.0,
        0.0,
        waste_level_pct=50,
    )
    assert fill == pytest.approx(0.0)
    assert applied == {}


@pytest.mark.parametrize("scenario_id", ["normal", "peak_traffic", "rain", "saturated", "broken_vehicle"])
def test_combined_optional_params_per_scenario(scenario_id: str) -> None:
    traffic, fill = SCENARIO_BASE[scenario_id]
    out_traffic, out_fill, applied = apply_simulation_parameter_modifiers(
        scenario_id,
        traffic,
        fill,
        rain_intensity="media",
        waste_level_pct=20,
    )
    if scenario_id == "rain":
        assert out_traffic > traffic
        assert "rainIntensity" in applied
    else:
        assert out_traffic == pytest.approx(traffic)
    if scenario_id == "saturated":
        assert out_fill > fill
        assert applied.get("wasteLevelPct") == 20
    else:
        assert out_fill == pytest.approx(fill)


def test_normalizers() -> None:
    assert normalize_rain_intensity("Alta") == "alta"
    assert normalize_rain_intensity("extrema") is None
    assert normalize_waste_level_pct(30) == 30
    assert normalize_waste_level_pct(25) is None
    assert normalize_duration_hours(4) == 4
    assert normalize_duration_hours(0) is None
