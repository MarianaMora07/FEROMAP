from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import CamelModel

VehicleStatusValue = Literal["available", "maintenance", "in_route", "inactive"]


class VehicleUpdate(CamelModel):
    status: VehicleStatusValue | None = Field(default=None)
    default_driver_id: int | None = Field(default=None)
    assigned_operators_count: int | None = Field(
        default=None,
        ge=1,
        le=12,
        description="Cuadrilla asignada hoy (conductor + operarios). null = dotación completa.",
    )

    @model_validator(mode="after")
    def assigned_within_ideal_when_both_set(self) -> "VehicleUpdate":
        # La validación contra ideal del vehículo se hace en el servicio (conoce el registro).
        return self


class VehicleOptimizationContext(CamelModel):
    last_optimized_codes: list[str]
    last_optimized_at: str | None
