from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class OptimizeRequest(CamelModel):
    scenario_id: str | None = Field(
        default=None,
        description="Escenario operativo (normal, rain, …). Si se omite y hay caseStudyId, usa el default del caso.",
    )
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
        description=(
            "Jornada de referencia en horas (1–12). Recorta el presupuesto de turno del motor "
            "(si es menor que la jornada de la instalación) y define exceedsWorkday."
        ),
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
    priority_fill_level: bool | None = Field(
        default=None,
        description="Priorizar contenedores con llenado ≥80% en heurística ACO.",
    )
    time_window_enabled: bool | None = Field(
        default=None,
        description="Ventanas amplias por sector (mañana/tarde) en construcción de ruta.",
    )
    departure_hour: int | None = Field(
        default=None,
        ge=0,
        le=23,
        description=(
            "Hora de salida de la flota (0–23). Activa la franja horaria de congestión: "
            "con factor efectivo ≠ 1 el motor enruta por tiempo ponderado y escala "
            "los tiempos de viaje (06–09 pico mañana ×1.30, 17–19 ×1.25, …)."
        ),
    )
    kpi_view: Literal["distance", "time", "co2"] | None = Field(
        default=None,
        description="Métrica principal para narrativa de KPIs (no altera el fitness del solver).",
    )
    planning_level: Literal["strategic", "administrative", "operational", "simulation"] | None = None
    operation_date: date | None = None
    collection_point_ids: list[int] | None = None
    case_study_id: int | None = Field(
        default=None,
        description="Caso de estudio: acota puntos y aplica overrides solo en memoria.",
    )
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
