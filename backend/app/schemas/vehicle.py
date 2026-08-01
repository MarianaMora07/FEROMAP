from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

VehicleStatusValue = Literal["available", "maintenance", "in_route", "inactive"]


class VehicleUpdate(CamelModel):
    status: VehicleStatusValue | None = Field(default=None)
    default_driver_id: int | None = Field(default=None)


class VehicleOptimizationContext(CamelModel):
    last_optimized_codes: list[str]
    last_optimized_at: str | None
