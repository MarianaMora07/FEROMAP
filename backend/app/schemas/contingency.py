from datetime import date

from app.schemas.common import CamelModel


class VehicleBreakdownRequest(CamelModel):
    vehicle_id: str
    route_id: int | None = None
    description: str | None = None


class CriticalContainerRecalcRequest(CamelModel):
    collection_point_code: str
    daily_plan_id: int | None = None
    operation_date: date | None = None
