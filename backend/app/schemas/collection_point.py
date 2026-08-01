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


class CollectionPointOptimizationContext(CamelModel):
    last_optimized_codes: list[str]
    last_optimized_at: str | None
    priority_boost_codes: list[str]
    critical_count: int


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
