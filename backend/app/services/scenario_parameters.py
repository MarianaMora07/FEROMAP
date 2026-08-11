from __future__ import annotations

from typing import Any

RAIN_INTENSITY_FACTORS: dict[str, float] = {
    "baja": 1.05,
    "media": 1.15,
    "alta": 1.30,
}

VALID_WASTE_LEVELS = {10, 20, 30, 50}


def normalize_rain_intensity(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized if normalized in RAIN_INTENSITY_FACTORS else None


def normalize_waste_level_pct(value: int | None) -> int | None:
    if value is None:
        return None
    return value if value in VALID_WASTE_LEVELS else None


def normalize_duration_hours(value: int | None) -> int | None:
    if value is None:
        return None
    if 1 <= value <= 12:
        return value
    return None


def apply_simulation_parameter_modifiers(
    scenario_id: str,
    traffic_mult: float,
    fill_boost: float,
    *,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
) -> tuple[float, float, dict[str, Any]]:
    """Aplica modificadores opcionales de la UI sobre los valores base del escenario."""
    applied: dict[str, Any] = {}
    rain = normalize_rain_intensity(rain_intensity)
    waste = normalize_waste_level_pct(waste_level_pct)

    if scenario_id == "rain" and rain is not None:
        factor = RAIN_INTENSITY_FACTORS[rain]
        traffic_mult *= factor
        applied["rainIntensity"] = rain
        applied["rainTrafficFactor"] = factor

    if scenario_id == "saturated" and waste is not None:
        fill_boost += float(waste)
        applied["wasteLevelPct"] = waste

    return traffic_mult, fill_boost, applied
