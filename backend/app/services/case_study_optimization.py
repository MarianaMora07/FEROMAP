"""Integración casos de estudio ↔ motor de optimización (Fase 12.3)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint
from app.domain.case_study import (
    CaseStudyPointMembership,
    CatalogPointSnapshot,
    OptimizationPointSource,
    active_case_study_point_ids,
    normalize_case_study_code,
    normalize_default_scenario_id,
    resolve_optimization_point_source,
    resolve_point_demand_kg,
)
from app.services.case_study_service import CaseStudyNotFoundError, _parse_default_parameters


@dataclass(frozen=True)
class CaseStudyEngineContext:
    study: CaseStudy
    memberships_by_point_id: dict[int, CaseStudyPoint]
    point_source: OptimizationPointSource
    resolved_point_ids: list[int]


@dataclass(frozen=True)
class ResolvedEngineParameters:
    scenario_id: str
    operators_shortage: int | None
    aco_ants: int | None
    aco_iterations: int | None
    priority_fill_level: bool | None
    time_window_enabled: bool | None
    estimated_duration_hours: int | None
    rain_intensity: str | None
    waste_level_pct: int | None
    workload_balance_weight: float | None = None
    makespan_weight: float | None = None
    min_active_vehicles: int | None = None
    max_route_hours_target: float | None = None


_CASE_STUDY_DEFAULT_KEYS: tuple[tuple[str, str], ...] = (
    ("operatorsShortage", "operators_shortage"),
    ("acoAnts", "aco_ants"),
    ("acoIterations", "aco_iterations"),
    ("priorityFillLevel", "priority_fill_level"),
    ("timeWindowEnabled", "time_window_enabled"),
    ("estimatedDurationHours", "estimated_duration_hours"),
    ("rainIntensity", "rain_intensity"),
    ("wasteLevelPct", "waste_level_pct"),
    ("workloadBalanceWeight", "workload_balance_weight"),
    ("makespanWeight", "makespan_weight"),
    ("minActiveVehicles", "min_active_vehicles"),
    ("maxRouteHoursTarget", "max_route_hours_target"),
)


def get_case_study_by_id(db: Session, case_study_id: int) -> CaseStudy:
    study = db.scalar(
        select(CaseStudy)
        .where(CaseStudy.id == case_study_id, CaseStudy.deleted_at.is_(None))
        .options(joinedload(CaseStudy.point_memberships))
    )
    if study is None:
        raise CaseStudyNotFoundError(f"Caso de estudio no encontrado: {case_study_id}")
    return study


def get_case_study_by_code(db: Session, code: str) -> CaseStudy:
    normalized = normalize_case_study_code(code)
    study = db.scalar(
        select(CaseStudy)
        .where(CaseStudy.code == normalized, CaseStudy.deleted_at.is_(None))
        .options(joinedload(CaseStudy.point_memberships))
    )
    if study is None:
        raise CaseStudyNotFoundError(f"Caso de estudio no encontrado: {normalized}")
    return study


def prepare_case_study_engine_context(
    db: Session,
    *,
    case_study_id: int,
    collection_point_ids: list[int] | None,
) -> CaseStudyEngineContext:
    study = get_case_study_by_id(db, case_study_id)
    memberships = [row for row in study.point_memberships if row.active_in_study]
    case_point_ids = active_case_study_point_ids(
        [
            CaseStudyPointMembership(
                collection_point_id=row.collection_point_id,
                active_in_study=row.active_in_study,
            )
            for row in memberships
        ]
    )
    source, ids = resolve_optimization_point_source(
        case_study_id=case_study_id,
        case_study_point_ids=case_point_ids,
        request_collection_point_ids=collection_point_ids,
    )
    assert ids is not None
    memberships_by_point_id = {row.collection_point_id: row for row in memberships}
    return CaseStudyEngineContext(
        study=study,
        memberships_by_point_id=memberships_by_point_id,
        point_source=source,
        resolved_point_ids=ids,
    )


def resolve_engine_parameters(
    study: CaseStudy | None,
    *,
    scenario_id: str | None,
    operators_shortage: int | None = None,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    priority_fill_level: bool | None = None,
    time_window_enabled: bool | None = None,
    estimated_duration_hours: int | None = None,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    workload_balance_weight: float | None = None,
    makespan_weight: float | None = None,
    min_active_vehicles: int | None = None,
    max_route_hours_target: float | None = None,
) -> ResolvedEngineParameters:
    defaults = _parse_default_parameters(study.default_parameters_json if study else None)

    resolved_scenario = (
        normalize_default_scenario_id(scenario_id)
        if scenario_id is not None
        else normalize_default_scenario_id(study.default_scenario_id if study else None)
    )

    resolved: dict[str, Any] = {
        "scenario_id": resolved_scenario,
        "operators_shortage": operators_shortage,
        "aco_ants": aco_ants,
        "aco_iterations": aco_iterations,
        "priority_fill_level": priority_fill_level,
        "time_window_enabled": time_window_enabled,
        "estimated_duration_hours": estimated_duration_hours,
        "rain_intensity": rain_intensity,
        "waste_level_pct": waste_level_pct,
        "workload_balance_weight": workload_balance_weight,
        "makespan_weight": makespan_weight,
        "min_active_vehicles": min_active_vehicles,
        "max_route_hours_target": max_route_hours_target,
    }
    for json_key, param_name in _CASE_STUDY_DEFAULT_KEYS:
        if resolved[param_name] is None and json_key in defaults:
            resolved[param_name] = defaults[json_key]

    return ResolvedEngineParameters(**resolved)


def load_optimization_collection_points(
    db: Session,
    *,
    allowed_ids: list[int] | None,
) -> list[CollectionPoint]:
    stmt = (
        select(CollectionPoint)
        .where(CollectionPoint.deleted_at.is_(None), CollectionPoint.status == "active")
        .options(joinedload(CollectionPoint.sector))
        .order_by(CollectionPoint.code)
    )
    if allowed_ids is not None:
        stmt = stmt.where(CollectionPoint.id.in_(allowed_ids))

    points = list(db.scalars(stmt).unique().all())
    if allowed_ids is not None:
        found = {point.id for point in points}
        missing = sorted(set(allowed_ids) - found)
        if missing:
            raise ValueError(f"Puntos de recolección no disponibles: {missing}")
        order = {point_id: index for index, point_id in enumerate(allowed_ids)}
        points = sorted(points, key=lambda point: order.get(point.id, point.id))

    if not points:
        raise ValueError("No hay puntos de recolección para optimizar")
    return points


def resolve_customer_demand(
    point: CollectionPoint,
    membership: CaseStudyPoint | None,
    *,
    fill_boost: float,
) -> tuple[float, int]:
    """Demanda y fill % efectivos (overrides solo en memoria)."""
    snapshot = CatalogPointSnapshot(
        collection_point_id=point.id,
        max_capacity_kg=float(point.max_capacity_kg),
        current_fill_level_kg=float(point.current_fill_level_kg),
        status=point.status,
    )
    domain_membership = None
    if membership is not None:
        domain_membership = CaseStudyPointMembership(
            collection_point_id=membership.collection_point_id,
            active_in_study=membership.active_in_study,
            fill_level_kg_override=(
                float(membership.fill_level_kg_override)
                if membership.fill_level_kg_override is not None
                else None
            ),
            demand_kg_override=(
                float(membership.demand_kg_override) if membership.demand_kg_override is not None else None
            ),
        )

    resolved = resolve_point_demand_kg(snapshot, domain_membership)
    demand = resolved.demand_kg * (1 + fill_boost / 100)
    cap = float(point.max_capacity_kg)
    boosted_pct = min(100, int(round(resolved.fill_level_kg / cap * 100))) if cap > 0 else 0
    boosted_pct = min(100, boosted_pct + int(fill_boost))

    if bool(getattr(point, "priority_boost", False)):
        boosted_pct = min(100, boosted_pct + 25)
        demand = max(demand, cap * 0.85)

    if demand <= 0:
        demand = cap * boosted_pct / 100

    return demand, boosted_pct


def case_study_simulation_payload(engine_context: CaseStudyEngineContext) -> dict[str, Any]:
    study = engine_context.study
    return {
        "caseStudyId": study.id,
        "caseStudyCode": study.code,
        "caseStudyName": study.name,
        "caseStudyPointSource": engine_context.point_source.value,
        "caseStudyPointIds": engine_context.resolved_point_ids,
        "defaultScenarioId": study.default_scenario_id,
        "defaultParameters": _parse_default_parameters(study.default_parameters_json),
    }
