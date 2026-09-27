from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class SectorUpdate(CamelModel):
    """Ajuste del factor de velocidad de llenado de una zona."""

    fill_rate_factor: float = Field(gt=0, le=10)


class SectorGenerationRateUpdate(CamelModel):
    """Configuración de generación de la zona (parcial).

    - ``generationRateKgPerDay``: tasa total manual (kg/día); ``null`` la limpia.
    - ``perCapitaKgPerDay``: tasa per cápita (kg/hab/día); si se define, la tasa
      total se deriva como ``población × per cápita``.
    - ``distributionMode``: ``equal`` | ``capacity`` | ``population``.
    """

    generation_rate_kg_per_day: float | None = Field(default=None, ge=0, le=1_000_000)
    per_capita_kg_per_day: float | None = Field(default=None, ge=0, le=100)
    distribution_mode: Literal["equal", "capacity", "population"] | None = None


class SectorTerritoryUpdate(CamelModel):
    """Reemplaza los sectores de preferencia (territorio) de un conductor."""

    sector_ids: list[int] = Field(default_factory=list)
