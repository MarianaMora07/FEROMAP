from app.schemas.common import CamelModel


class VehicleBreakdownRequest(CamelModel):
    vehicle_id: str
    route_id: int | None = None
    description: str | None = None
