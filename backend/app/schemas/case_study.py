from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class CaseStudyDefaultParameters(CamelModel):
    operators_shortage: int | None = Field(default=None, ge=0, le=5)
    aco_ants: int | None = Field(default=None, ge=4, le=30)
    aco_iterations: int | None = Field(default=None, ge=5, le=60)
    priority_fill_level: bool | None = None
    time_window_enabled: bool | None = None
    estimated_duration_hours: int | None = Field(default=None, ge=1, le=12)
    rain_intensity: str | None = None
    waste_level_pct: int | None = Field(default=None, ge=0, le=50)
    # Fase 13 — objetivo multiobjetivo.
    workload_balance_weight: float | None = Field(default=None, ge=0, le=10)
    makespan_weight: float | None = Field(default=None, ge=0, le=10)
    min_active_vehicles: int | None = Field(default=None, ge=1, le=100)
    max_route_hours_target: float | None = Field(default=None, ge=1, le=18)


class CaseStudyPointInput(CamelModel):
    collection_point_id: int = Field(gt=0)
    active_in_study: bool = True
    fill_level_kg_override: float | None = Field(default=None, ge=0)
    demand_kg_override: float | None = Field(default=None, ge=0)
    notes: str | None = None
    sort_order: int | None = None


class CaseStudyPointOverride(CamelModel):
    active_in_study: bool | None = None
    fill_level_kg_override: float | None = Field(default=None, ge=0)
    demand_kg_override: float | None = Field(default=None, ge=0)
    notes: str | None = None
    sort_order: int | None = None


class CaseStudyPointsReplace(CamelModel):
    points: list[CaseStudyPointInput] = Field(min_length=0)


class CaseStudyCreate(CamelModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    default_scenario_id: str | None = None
    default_parameters: CaseStudyDefaultParameters | dict | None = None
    status: str | None = None

    @field_validator("code")
    @classmethod
    def strip_code(cls, value: str) -> str:
        return value.strip()


class CaseStudyUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    default_scenario_id: str | None = None
    default_parameters: CaseStudyDefaultParameters | dict | None = None
    status: str | None = None


class CaseStudyDuplicate(CamelModel):
    code: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, max_length=255)
