"""Schemas de configuración por zona (parroquia) — F8."""

from pydantic import Field, field_validator, model_validator

from app.domain.zone_window import parse_hhmm, window_offsets
from app.schemas.common import CamelModel


class ParishZoneUpdate(CamelModel):
    """Ajuste parcial de instalaciones y ventana horaria de una zona.

    Los campos ausentes no se tocan. Enviar ``null`` limpia el valor (vuelve a la
    configuración operativa global / sin ventana).
    """

    depot_lat: float | None = Field(default=None, ge=-90, le=90)
    depot_lon: float | None = Field(default=None, ge=-180, le=180)
    landfill_lat: float | None = Field(default=None, ge=-90, le=90)
    landfill_lon: float | None = Field(default=None, ge=-180, le=180)
    time_window_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    time_window_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")

    @field_validator("time_window_start", "time_window_end")
    @classmethod
    def _validate_hhmm(cls, value: str | None) -> str | None:
        if value is not None and parse_hhmm(value) is None:
            raise ValueError("Hora inválida; usa el formato HH:MM")
        return value

    @model_validator(mode="after")
    def _validate_window_pair(self) -> "ParishZoneUpdate":
        if self.time_window_start is not None and self.time_window_end is not None:
            if window_offsets(self.time_window_start, self.time_window_end) is None:
                raise ValueError(
                    "Ventana horaria inválida: inicio anterior al fin y dentro de 06:00–18:00"
                )
        return self
