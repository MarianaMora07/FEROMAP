"""Perfil de congestión por franja horaria (Tarea 4 — Opción A).

Cada banda define un factor que se multiplica sobre el tiempo de viaje base de
las aristas del grafo vial. Fuera de las bandas (00:00–06:00 y 22:00–24:00) se
usa un factor neutro 1.0.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CongestionBand:
    """Banda horaria de congestión con factor multiplicador de tiempo de viaje."""

    label: str
    range_label: str
    start_hour: int  # inclusivo
    end_hour: int  # exclusivo
    factor: float

    def display_label(self) -> str:
        return f"{self.label} ({self.range_label}) ×{self.factor:g}"


CONGESTION_BANDS: tuple[CongestionBand, ...] = (
    CongestionBand("Madrugada", "00:00–06:00", 0, 6, 1.0),
    CongestionBand("Pico mañana", "06:00–09:00", 6, 9, 1.30),
    CongestionBand("Valle", "09:00–17:00", 9, 17, 1.0),
    CongestionBand("Pico tarde", "17:00–19:00", 17, 19, 1.25),
    CongestionBand("Noche", "19:00–22:00", 19, 22, 0.90),
    CongestionBand("Cierre", "22:00–24:00", 22, 24, 1.0),
)


def normalize_departure_hour(departure_hour: int | None) -> int | None:
    """Valida/clampa la hora de salida a [0, 23]; None se conserva (sin banda)."""
    if departure_hour is None:
        return None
    try:
        value = int(departure_hour)
    except (TypeError, ValueError):
        return None
    if value < 0 or value > 23:
        return None
    return value


def congestion_band_for_hour(hour: int | None) -> CongestionBand | None:
    """Banda que contiene la hora dada (None si no hay hora de salida definida)."""
    resolved = normalize_departure_hour(hour)
    if resolved is None:
        return None
    for band in CONGESTION_BANDS:
        if band.start_hour <= resolved < band.end_hour:
            return band
    return None


def congestion_factor_for_hour(hour: int | None) -> float:
    """Factor de congestión para la hora de salida (1.0 si no se especifica)."""
    band = congestion_band_for_hour(hour)
    return band.factor if band is not None else 1.0


def is_traffic_weighted(traffic_multiplier: float, band_factor: float) -> bool:
    """¿El motor debe enrutar por tiempo ponderado?

    True cuando el factor efectivo (escenario × banda) difiere de 1.0: solo así
    tiene sentido elegir caminos alternativos y escalar los tiempos de viaje.
    Con factor efectivo 1.0 se conserva el comportamiento histórico (camino por
    longitud y tiempos de viaje base).
    """
    return abs(float(traffic_multiplier) * float(band_factor) - 1.0) > 1e-6
