from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class DailyOptimizeRequest(CamelModel):
    priority_fill_level: bool | None = Field(
        default=None,
        description="Priorizar contenedores con llenado ≥80% en heurística ACO.",
    )
    time_window_enabled: bool | None = Field(
        default=None,
        description="Ventanas amplias por sector (mañana/tarde) en construcción de ruta.",
    )
    kpi_view: Literal["distance", "time", "co2"] | None = Field(
        default=None,
        description="Métrica principal para narrativa de KPIs (no altera el fitness del solver).",
    )
    departure_hour: int | None = Field(
        default=None,
        ge=0,
        le=23,
        description="Hora de salida de la flota (0–23) para la franja de congestión.",
    )
    estimated_duration_hours: int | None = Field(
        default=None,
        ge=1,
        le=12,
        description=(
            "Jornada de turno en horas (1–12). Recorta el presupuesto de jornada del motor "
            "(si es menor que el de la instalación), lo que reparte la carga entre más vehículos."
        ),
    )
    # Fase 13 — objetivo multiobjetivo (distancia · uso de flota · tiempo de servicio).
    workload_balance_weight: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description=(
            "Peso de equidad de carga (Fase 13): penaliza el desbalance de horas de servicio "
            "entre camiones (σ/μ). 0 = solo distancia; si se omite, se usa el valor de "
            "Administración (0,5 por defecto)."
        ),
    )
    makespan_weight: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description=(
            "Peso del makespan (Fase 13): penaliza la ruta más larga (T_max / jornada). "
            "0 = solo distancia; si se omite, se usa el valor de Administración (1 por defecto)."
        ),
    )
    min_active_vehicles: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description=(
            "Mínimo de vehículos activos del día (Fase 13). Si es infactible respecto a "
            "los puntos programados se degrada con warning."
        ),
    )
    max_route_hours_target: float | None = Field(
        default=None,
        ge=1,
        le=18,
        description="Jornada objetivo (h) del KPI finishUnderTargetPct (Fase 13, default 8 h).",
    )
