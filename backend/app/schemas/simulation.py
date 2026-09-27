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
    workload_balance_weight: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description=(
            "Peso de equidad de carga (Fase 13): penaliza el desbalance de horas de servicio "
            "entre camiones normalizado (σ/μ). 0 = solo distancia; si se omite, se usa el "
            "valor de Administración (0,5 por defecto)."
        ),
    )
    makespan_weight: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description=(
            "Peso del makespan (Fase 13): penaliza la ruta más larga normalizada "
            "(T_max / jornada). 0 = solo distancia; si se omite, se usa el valor de "
            "Administración (1 por defecto)."
        ),
    )
    min_active_vehicles: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description=(
            "Mínimo de vehículos activos por día (Fase 13). Si es infactible respecto "
            "a los puntos programados, se degrada con warning explícito."
        ),
    )
    max_route_hours_target: float | None = Field(
        default=None,
        ge=1,
        le=18,
        description="Jornada objetivo (h) del KPI finishUnderTargetPct (Fase 13). Default 8 h.",
    )
    aco_alpha: float | None = Field(
        default=None,
        gt=0,
        le=20,
        description=(
            "Hiperparámetro ACO α (importancia de la feromona). Si se omite, usa el "
            "valor de Administración (1.0)."
        ),
    )
    aco_beta: float | None = Field(
        default=None,
        ge=0,
        le=20,
        description=(
            "Hiperparámetro ACO β (importancia del heurístico de cercanía). Si se omite, "
            "usa el valor de Administración (3.0)."
        ),
    )
    aco_rho: float | None = Field(
        default=None,
        gt=0,
        le=1,
        description=(
            "Hiperparámetro ACO ρ (evaporación de feromona, 0–1). Si se omite, usa el "
            "valor de Administración (0.12)."
        ),
    )
    pheromone_q: float | None = Field(
        default=None,
        gt=0,
        le=1_000_000,
        description=(
            "Hiperparámetro ACO Q (feromona depositada por la mejor hormiga). Si se omite, "
            "usa el valor de Administración (1.0)."
        ),
    )
    seed: int | None = Field(
        default=None,
        ge=0,
        le=2_147_483_647,
        description=(
            "Semilla del ACO (Fase 13). Fija la corrida para reproducibilidad y barridos de "
            "robustez. Si se omite, usa 42."
        ),
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
