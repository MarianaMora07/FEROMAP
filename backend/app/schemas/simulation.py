from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class OptimizeRequest(CamelModel):
    scenario_id: str = "normal"
    rain_intensity: str | None = Field(
        default=None,
        description="Intensidad de lluvia (baja|media|alta). Solo aplica si scenarioId=rain.",
    )
    waste_level_pct: int | None = Field(
        default=None,
        ge=0,
        le=50,
        description="Incremento adicional de demanda (10|20|30|50). Solo aplica si scenarioId=saturated.",
    )
    estimated_duration_hours: int | None = Field(
        default=None,
        ge=1,
        le=12,
        description="Duración estimada de operación (horas). Se persiste; no modifica el motor VRP.",
    )
    operators_shortage: int | None = Field(
        default=None,
        ge=0,
        le=5,
        description=(
            "Operarios de campo ausentes en el turno (0–5). "
            "Se persiste en simulationParameters; tiempo de servicio en KPIs — Fase 2 (ADR-003)."
        ),
    )
    aco_ants: int | None = Field(
        default=None,
        ge=4,
        le=30,
        description="Hormigas por iteración del ACO. Si se omite, usa ACO_ANTS del servidor.",
    )
    aco_iterations: int | None = Field(
        default=None,
        ge=5,
        le=60,
        description="Iteraciones del ACO. Si se omite, usa ACO_ITERATIONS del servidor.",
    )
    planning_level: Literal["strategic", "administrative", "operational", "simulation"] | None = None
    operation_date: date | None = None
    collection_point_ids: list[int] | None = None
    daily_plan_id: int | None = None
    weekly_plan_id: int | None = None
    auto_dispatch: bool | None = None


class OptimizeJobCreated(CamelModel):
    job_id: str


class SimulationLogEntry(CamelModel):
    id: str
    timestamp: str
    message: str
    type: str
    phase_id: str | None = None


class OptimizeJobStatus(CamelModel):
    job_id: str
    status: str
    phase: str | None = None
    progress: int = 0
    logs: list[SimulationLogEntry] = Field(default_factory=list)
    result: dict | None = None
    error: str | None = None
    aco_convergence: list[dict] = Field(default_factory=list, alias="acoConvergence")


class OptimizeJobCancelResponse(CamelModel):
    job_id: str
    status: str
