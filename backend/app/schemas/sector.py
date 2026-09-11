from pydantic import Field

from app.schemas.common import CamelModel


class SectorUpdate(CamelModel):
    """Ajuste del factor de velocidad de llenado de una zona."""

    fill_rate_factor: float = Field(gt=0, le=10)


class SectorTerritoryUpdate(CamelModel):
    """Reemplaza los sectores de preferencia (territorio) de un conductor."""

    sector_ids: list[int] = Field(default_factory=list)
