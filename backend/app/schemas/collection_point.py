from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class CollectionPointCreate(CamelModel):
    sector_id: int = Field(gt=0)
    code: str = Field(min_length=1, max_length=50)
    latitude: float
    longitude: float
    max_capacity_kg: float = Field(gt=0)
    current_fill_level_kg: float | None = Field(default=None, ge=0)
    status: str | None = Field(default="active", max_length=50)
    fill_rate_factor_override: float | None = Field(default=None, gt=0, le=10)
    estimated_fill_hours: float | None = Field(default=None, gt=0, le=8760)
    generation_rate_kg_per_day: float | None = Field(default=None, gt=0, le=1_000_000)
    served_population: float | None = Field(default=None, ge=0, le=100_000_000)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class CollectionPointUpdate(CamelModel):
    sector_id: int | None = Field(default=None, gt=0)
    latitude: float | None = None
    longitude: float | None = None
    max_capacity_kg: float | None = Field(default=None, gt=0)
    current_fill_level_kg: float | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, max_length=50)
    priority_boost: bool | None = None
    fill_rate_factor_override: float | None = Field(default=None, gt=0, le=10)
    estimated_fill_hours: float | None = Field(default=None, gt=0, le=8760)
    generation_rate_kg_per_day: float | None = Field(default=None, ge=0, le=1_000_000)
    served_population: float | None = Field(default=None, ge=0, le=100_000_000)


class CollectionPointCalibrationRequest(CamelModel):
    """Calibración de la tasa de generación con pesos reales recolectados."""

    days: int = Field(default=30, ge=1, le=365)
    sector_id: int | None = Field(default=None, gt=0)
    alpha: float | None = Field(default=None, gt=0, le=1)


class CollectionPointOptimizationContext(CamelModel):
    last_optimized_codes: list[str]
    last_optimized_at: str | None
    priority_boost_codes: list[str]
    critical_count: int
    overloaded_codes: list[str] = []


class CollectionPointOut(CamelModel):
    code: str
    id: str
    label: str
    address: str
    sector: str
    sector_id: int
    fill_level: int
    status: str
    active: bool
    container_type: str
    capacity_kg: float
    capacity_l: float
    current_fill_level_kg: float
    last_emptied_at: str | None
    last_collection: str
    frequency: str
    latitude: float
    longitude: float
    priority: str | None = None
    road_node_id: int | None = None
    priority_boost: bool = False
    fill_rate_factor_override: float | None = None
    fill_rate_factor: float = 1.0
    estimated_fill_hours: float = 72.0
    effective_fill_hours: float = 72.0
    generation_rate_kg_per_day: float | None = None
    generation_rate_override_kg_per_day: float | None = None
    served_population: float | None = None
    overflow_kg: float = 0.0
    overflow_pct: int = 0
    last_calibrated_at: str | None = None
    calibration_samples: int | None = None
