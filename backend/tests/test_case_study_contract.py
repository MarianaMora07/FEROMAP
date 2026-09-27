"""Tests del contrato de casos de estudio (ADR-005, Fase 12.0)."""

from __future__ import annotations

import pytest

from app.domain.case_study import (
    CaseStudyPointMembership,
    CaseStudyRecord,
    CatalogPointSnapshot,
    OptimizationPointSource,
    active_case_study_point_ids,
    case_study_context_for_simulation,
    normalize_case_study_code,
    normalize_case_study_status,
    normalize_default_scenario_id,
    resolve_optimization_point_source,
    resolve_point_demand_kg,
)


def test_normalize_case_study_code():
    assert normalize_case_study_code(" ce unare norte ") == "CE-UNARE-NORTE"
    assert normalize_case_study_code("ce_multi_viaje") == "CE-MULTI-VIAJE"


def test_normalize_case_study_code_rejects_empty():
    with pytest.raises(ValueError, match="vacío"):
        normalize_case_study_code("   ")


def test_valid_status_and_scenario():
    assert normalize_case_study_status("active") == "active"
    assert normalize_default_scenario_id("rain") == "rain"
    with pytest.raises(ValueError):
        normalize_case_study_status("deleted")
    with pytest.raises(ValueError):
        normalize_default_scenario_id("hurricane")


def test_resolve_point_source_priority_case_study_only():
    source, ids = resolve_optimization_point_source(
        case_study_id=1,
        case_study_point_ids=[3, 1, 2],
        request_collection_point_ids=None,
    )
    assert source == OptimizationPointSource.CASE_STUDY
    assert ids == [1, 2, 3]


def test_resolve_point_source_request_ids_without_case():
    source, ids = resolve_optimization_point_source(
        case_study_id=None,
        case_study_point_ids=None,
        request_collection_point_ids=[5, 5, 4],
    )
    assert source == OptimizationPointSource.REQUEST_IDS
    assert ids == [4, 5]


def test_resolve_point_source_legacy_all_active():
    source, ids = resolve_optimization_point_source(
        case_study_id=None,
        case_study_point_ids=None,
        request_collection_point_ids=None,
    )
    assert source == OptimizationPointSource.ALL_ACTIVE
    assert ids is None


def test_intersection_case_study_and_request_ids():
    source, ids = resolve_optimization_point_source(
        case_study_id=1,
        case_study_point_ids=[1, 2, 3],
        request_collection_point_ids=[2, 4],
    )
    assert source == OptimizationPointSource.CASE_STUDY
    assert ids == [2]


def test_intersection_empty_raises():
    with pytest.raises(ValueError, match="intersección vacía"):
        resolve_optimization_point_source(
            case_study_id=1,
            case_study_point_ids=[1, 2],
            request_collection_point_ids=[9],
        )


def test_active_case_study_point_ids():
    memberships = [
        CaseStudyPointMembership(collection_point_id=1, active_in_study=True),
        CaseStudyPointMembership(collection_point_id=2, active_in_study=False),
        CaseStudyPointMembership(collection_point_id=3, active_in_study=True),
    ]
    assert active_case_study_point_ids(memberships) == [1, 3]


def test_resolve_demand_with_overrides():
    catalog = CatalogPointSnapshot(
        collection_point_id=10,
        max_capacity_kg=1000.0,
        current_fill_level_kg=400.0,
    )
    from_catalog = resolve_point_demand_kg(catalog, None)
    assert from_catalog.demand_kg == 400.0
    assert from_catalog.source == "catalog"

    fill_override = resolve_point_demand_kg(
        catalog,
        CaseStudyPointMembership(collection_point_id=10, fill_level_kg_override=900.0),
    )
    assert fill_override.demand_kg == 900.0
    assert fill_override.source == "fill_override"

    demand_override = resolve_point_demand_kg(
        catalog,
        CaseStudyPointMembership(collection_point_id=10, demand_kg_override=750.0),
    )
    assert demand_override.demand_kg == 750.0
    assert demand_override.source == "demand_override"


def test_case_study_context_for_simulation():
    record = CaseStudyRecord(
        id=7,
        code="CE-UNARE-NORTE",
        name="Unare Norte",
        point_memberships=(
            CaseStudyPointMembership(collection_point_id=1),
            CaseStudyPointMembership(collection_point_id=2, active_in_study=False),
        ),
    )
    ctx = case_study_context_for_simulation(record)
    assert ctx["caseStudyCode"] == "CE-UNARE-NORTE"
    assert ctx["activePointCount"] == 1
