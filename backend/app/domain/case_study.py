"""Contrato de casos de estudio aislados (ADR-005).

Fase 12.0 — tipos puros y reglas de resolución. Sin ORM ni API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

# --- Constantes de contrato ---
CASE_STUDY_CODE_MAX_LEN = 64
CASE_STUDY_NAME_MAX_LEN = 255

DEFAULT_CASE_STUDY_SCENARIO_ID = "normal"

VALID_CASE_STUDY_STATUSES: frozenset[str] = frozenset({"draft", "active", "archived"})

# Escenarios operativos (clima/tráfico) — alineado con data/seeds/scenarios.json
VALID_SCENARIO_IDS: frozenset[str] = frozenset(
    {"normal", "peak_traffic", "rain", "saturated", "broken_vehicle"}
)


class CaseStudyStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class OptimizationPointSource(StrEnum):
    """Fuente usada para armar la instancia VRP (prioridad documentada en ADR-005)."""

    CASE_STUDY = "case_study"
    REQUEST_IDS = "collection_point_ids"
    ALL_ACTIVE = "all_active"


@dataclass(frozen=True)
class CaseStudyDefaultParameters:
    """Defaults opcionales del caso; mismos campos que OptimizeRequest donde aplique."""

    operators_shortage: int | None = None
    aco_ants: int | None = None
    aco_iterations: int | None = None
    priority_fill_level: bool | None = None
    time_window_enabled: bool | None = None
    estimated_duration_hours: int | None = None
    rain_intensity: str | None = None
    waste_level_pct: int | None = None
    workload_balance_weight: float | None = None
    makespan_weight: float | None = None
    min_active_vehicles: int | None = None
    max_route_hours_target: float | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.operators_shortage is not None:
            out["operatorsShortage"] = self.operators_shortage
        if self.aco_ants is not None:
            out["acoAnts"] = self.aco_ants
        if self.aco_iterations is not None:
            out["acoIterations"] = self.aco_iterations
        if self.priority_fill_level is not None:
            out["priorityFillLevel"] = self.priority_fill_level
        if self.time_window_enabled is not None:
            out["timeWindowEnabled"] = self.time_window_enabled
        if self.estimated_duration_hours is not None:
            out["estimatedDurationHours"] = self.estimated_duration_hours
        if self.rain_intensity is not None:
            out["rainIntensity"] = self.rain_intensity
        if self.waste_level_pct is not None:
            out["wasteLevelPct"] = self.waste_level_pct
        if self.workload_balance_weight is not None:
            out["workloadBalanceWeight"] = self.workload_balance_weight
        if self.makespan_weight is not None:
            out["makespanWeight"] = self.makespan_weight
        if self.min_active_vehicles is not None:
            out["minActiveVehicles"] = self.min_active_vehicles
        if self.max_route_hours_target is not None:
            out["maxRouteHoursTarget"] = self.max_route_hours_target
        return out


@dataclass(frozen=True)
class CaseStudyPointMembership:
    """Membresía M:N con overrides locales al caso."""

    collection_point_id: int
    active_in_study: bool = True
    fill_level_kg_override: float | None = None
    demand_kg_override: float | None = None
    notes: str | None = None
    sort_order: int | None = None


@dataclass(frozen=True)
class CaseStudyRecord:
    """Shape lógico de case_studies (sin persistencia)."""

    id: int | None
    code: str
    name: str
    description: str | None = None
    default_scenario_id: str = DEFAULT_CASE_STUDY_SCENARIO_ID
    default_parameters: CaseStudyDefaultParameters = field(default_factory=CaseStudyDefaultParameters)
    status: str = CaseStudyStatus.DRAFT.value
    point_memberships: tuple[CaseStudyPointMembership, ...] = ()


@dataclass(frozen=True)
class CatalogPointSnapshot:
    """Datos mínimos del catálogo global para resolver demanda."""

    collection_point_id: int
    max_capacity_kg: float
    current_fill_level_kg: float
    status: str = "active"


@dataclass(frozen=True)
class ResolvedStudyPoint:
    """Punto listo para el motor tras aplicar overrides del caso."""

    collection_point_id: int
    demand_kg: float
    fill_level_kg: float
    source: str  # "catalog" | "fill_override" | "demand_override"


def normalize_case_study_code(raw: str) -> str:
    """Código estable: trim, mayúsculas, espacios → guiones."""
    cleaned = "-".join(part for part in raw.strip().upper().replace("_", "-").split() if part)
    if not cleaned:
        raise ValueError("case study code vacío")
    if len(cleaned) > CASE_STUDY_CODE_MAX_LEN:
        raise ValueError(f"case study code excede {CASE_STUDY_CODE_MAX_LEN} caracteres")
    return cleaned


def normalize_case_study_status(value: str | None) -> str:
    if value is None:
        return CaseStudyStatus.DRAFT.value
    normalized = value.strip().lower()
    if normalized not in VALID_CASE_STUDY_STATUSES:
        raise ValueError(f"status inválido: {value!r}")
    return normalized


def normalize_default_scenario_id(value: str | None) -> str:
    if value is None:
        return DEFAULT_CASE_STUDY_SCENARIO_ID
    normalized = value.strip().lower()
    if normalized not in VALID_SCENARIO_IDS:
        raise ValueError(f"scenario_id inválido: {value!r}")
    return normalized


def active_case_study_point_ids(memberships: list[CaseStudyPointMembership]) -> list[int]:
    return sorted(
        m.collection_point_id for m in memberships if m.active_in_study and m.collection_point_id > 0
    )


def resolve_optimization_point_source(
    *,
    case_study_id: int | None,
    case_study_point_ids: list[int] | None,
    request_collection_point_ids: list[int] | None,
) -> tuple[OptimizationPointSource, list[int] | None]:
    """Determina fuente e ids efectivos según ADR-005 § Decisión 3."""
    if case_study_id is not None and case_study_point_ids is not None:
        case_ids = set(case_study_point_ids)
        if request_collection_point_ids:
            intersection = sorted(case_ids & set(request_collection_point_ids))
            if not intersection:
                raise ValueError("intersección vacía entre caso de estudio y collectionPointIds")
            return OptimizationPointSource.CASE_STUDY, intersection
        active = sorted(case_ids)
        if not active:
            raise ValueError("el caso de estudio no tiene puntos activos")
        return OptimizationPointSource.CASE_STUDY, active

    if request_collection_point_ids:
        ids = sorted(set(request_collection_point_ids))
        if not ids:
            raise ValueError("collectionPointIds vacío")
        return OptimizationPointSource.REQUEST_IDS, ids

    return OptimizationPointSource.ALL_ACTIVE, None


def resolve_point_demand_kg(
    catalog: CatalogPointSnapshot,
    membership: CaseStudyPointMembership | None,
) -> ResolvedStudyPoint:
    """Override demanda > override llenado > catálogo."""
    cap = max(0.0, float(catalog.max_capacity_kg))
    catalog_fill = max(0.0, min(cap, float(catalog.current_fill_level_kg)))

    if membership is not None and membership.demand_kg_override is not None:
        demand = max(0.0, float(membership.demand_kg_override))
        fill = min(cap, demand)
        return ResolvedStudyPoint(
            collection_point_id=catalog.collection_point_id,
            demand_kg=demand,
            fill_level_kg=fill,
            source="demand_override",
        )

    if membership is not None and membership.fill_level_kg_override is not None:
        fill = max(0.0, min(cap, float(membership.fill_level_kg_override)))
        return ResolvedStudyPoint(
            collection_point_id=catalog.collection_point_id,
            demand_kg=fill,
            fill_level_kg=fill,
            source="fill_override",
        )

    return ResolvedStudyPoint(
        collection_point_id=catalog.collection_point_id,
        demand_kg=catalog_fill,
        fill_level_kg=catalog_fill,
        source="catalog",
    )


def case_study_context_for_simulation(
    record: CaseStudyRecord,
) -> dict[str, Any]:
    """Payload documental para parameters_json (Fase 12.3)."""
    return {
        "caseStudyId": record.id,
        "caseStudyCode": record.code,
        "caseStudyName": record.name,
        "defaultScenarioId": record.default_scenario_id,
        "defaultParameters": record.default_parameters.to_dict(),
        "activePointCount": len(active_case_study_point_ids(list(record.point_memberships))),
    }
