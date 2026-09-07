from datetime import date
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel


class WeeklyPlanDayInput(CamelModel):
    operation_date: date
    sector_ids: list[int] = Field(default_factory=list)
    collection_point_ids: list[int] = Field(default_factory=list)
    case_study_id: int | None = None
    expected_vehicle_count: int | None = None
    scenario_id_override: str | None = None


class WeeklyPlanCreate(CamelModel):
    week_start_date: date
    scenario_id: str = "normal"
    case_study_id: int | None = None
    fleet_by_type: dict[str, int] | None = None
    days: list[WeeklyPlanDayInput]
    notes: str | None = None


class WeeklyPlanUpdate(CamelModel):
    scenario_id: str | None = None
    case_study_id: int | None = None
    fleet_by_type: dict[str, int] | None = None
    days: list[WeeklyPlanDayInput] | None = None
    notes: str | None = None


class WeeklyPlanApprove(CamelModel):
    reference_simulation_id: int | None = None
    expected_kpis: dict[str, Any] | None = None
    allow_warnings: bool = False


class DailyPlanPointsUpdate(CamelModel):
    final_point_ids: list[int]


class DailyDispatchRequest(CamelModel):
    daily_plan_id: int | None = None


class PendingIncorporateRequest(CamelModel):
    target_operation_date: date


class DeferUncoveredRequest(CamelModel):
    target_operation_date: date | None = None


class PendingCancelRequest(CamelModel):
    reason: str | None = None


class PendingCancelBulkRequest(CamelModel):
    pending_ids: list[int] | None = None
    older_than_days: int | None = Field(default=None, gt=0)
    target_date: date | None = None


class OptimizePlanningContext(CamelModel):
    planning_level: Literal["strategic", "administrative", "operational", "simulation"] | None = None
    operation_date: date | None = None
    collection_point_ids: list[int] | None = None
    daily_plan_id: int | None = None
    weekly_plan_id: int | None = None
    auto_dispatch: bool | None = None
