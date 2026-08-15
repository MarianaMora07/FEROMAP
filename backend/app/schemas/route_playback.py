from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

RoutePlaybackStopType = Literal["collection", "landfill"]


class RoutePlaybackStop(CamelModel):
    sequence: int
    lng: float
    lat: float
    code: str
    service_minutes: int
    stop_type: RoutePlaybackStopType = Field(
        description='Tipo de parada: "collection" (contenedor) o "landfill" (vertedero).',
    )


class RoutePlaybackRoute(CamelModel):
    route_id: int
    vehicle_id: int
    vehicle_label: str
    color: str
    line_coordinates: list[list[float]] = Field(
        ...,
        description="Geometría [lng, lat] sobre red vial (incluye depósito si aplica).",
    )
    stops: list[RoutePlaybackStop]
    total_duration_minutes: int
    start_time: datetime | None = None


class DailyRoutePlaybackResponse(CamelModel):
    daily_plan_id: int
    operation_date: str
    preview_mode: bool = Field(
        description="True cuando las rutas aún no fueron despachadas (solo lectura, sin mutar BD).",
    )
    routes: list[RoutePlaybackRoute] = Field(max_length=6)
