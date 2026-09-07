from pydantic import Field

from app.schemas.common import CamelModel


class SectorTerritoryUpdate(CamelModel):
    """Reemplaza los sectores de preferencia (territorio) de un conductor."""

    sector_ids: list[int] = Field(default_factory=list)
