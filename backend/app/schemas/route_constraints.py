from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class DailyOptimizeRequest(CamelModel):
    priority_fill_level: bool | None = Field(
        default=None,
        description="Priorizar contenedores con llenado ≥80% en heurística ACO.",
    )
    time_window_enabled: bool | None = Field(
        default=None,
        description="Ventanas amplias por sector (mañana/tarde) en construcción de ruta.",
    )
    kpi_view: Literal["distance", "time", "co2"] | None = Field(
        default=None,
        description="Métrica principal para narrativa de KPIs (no altera el fitness del solver).",
    )
