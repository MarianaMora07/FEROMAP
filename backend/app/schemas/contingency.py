from datetime import date
from typing import Literal

from app.schemas.common import CamelModel


class VehicleBreakdownRequest(CamelModel):
    vehicle_id: str
    route_id: int | None = None
    description: str | None = None


class CriticalContainerRecalcRequest(CamelModel):
    collection_point_code: str
    daily_plan_id: int | None = None
    operation_date: date | None = None


class ContingencySimulationRequest(CamelModel):
    """Simulación dry-run de una contingencia sobre el plan del día."""

    type: Literal["breakdown", "critical_container"]
    vehicle_id: str | None = None
    point_code: str | None = None
