"""Schemas de contrato — dotación y tiempo de servicio (ADR-003)."""

from pydantic import Field

from app.schemas.common import CamelModel


class VehicleCrewFields(CamelModel):
    """Campos de dotación en vehículos (GET hoy; PATCH Fase 1)."""

    ideal_operators_count: int = Field(
        default=6,
        ge=1,
        le=12,
        description="Dotación ideal: conductor + operarios de campo (default 6 = 1+5).",
    )
    assigned_operators_count: int | None = Field(
        default=None,
        ge=1,
        le=12,
        description="Cuadrilla asignada hoy. null = dotación completa (ideal).",
    )


class SimulationCrewParameters(CamelModel):
    """Parámetros de ausentismo en simulación / optimize."""

    operators_shortage: int | None = Field(
        default=None,
        ge=0,
        le=5,
        description="Operarios de campo ausentes en el turno (0–5). No incluye al conductor.",
    )


class DurationBreakdown(CamelModel):
    """Desglose de duración (respuesta KPI — Fase 2)."""

    travel_hours: float
    service_hours: float
    crew_label: str
