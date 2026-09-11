"""Seed de casos de estudio desde data/seeds/case_studies.json."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint
from app.domain.case_study import normalize_case_study_code, normalize_case_study_status, normalize_default_scenario_id

SEEDS_DIR = Path(settings.data_dir) / "seeds"


def _load_json(name: str):
    path = SEEDS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"No existe {path}. Revisa data/seeds/")
    return json.loads(path.read_text(encoding="utf-8"))


def seed_case_studies(
    session: Session,
    *,
    collection_points: list[CollectionPoint],
) -> dict[str, CaseStudy]:
    """Inserta casos de estudio demo tras poblar collection_points."""
    data = _load_json("case_studies.json")
    point_by_code = {point.code: point for point in collection_points}
    studies_by_code: dict[str, CaseStudy] = {}

    for row in data:
        code = normalize_case_study_code(row["code"])
        study = CaseStudy(
            code=code,
            name=row["name"],
            description=row.get("description"),
            default_scenario_id=normalize_default_scenario_id(row.get("defaultScenarioId")),
            default_parameters_json=json.dumps(row.get("defaultParameters") or {}, ensure_ascii=False),
            status=normalize_case_study_status(row.get("status")),
        )
        session.add(study)
        session.flush()

        override_by_code = {
            point_row["collectionPointCode"]: point_row
            for point_row in (row.get("points") or [])
            if point_row.get("collectionPointCode")
        }

        if row.get("includeAllPoints"):
            sort_order = 0
            for catalog_point in sorted(collection_points, key=lambda item: item.code):
                if catalog_point.deleted_at is not None or catalog_point.status != "active":
                    continue
                sort_order += 1
                point_row = override_by_code.get(catalog_point.code, {})
                fill_override = point_row.get("fillLevelKgOverride")
                demand_override = point_row.get("demandKgOverride")
                session.add(
                    CaseStudyPoint(
                        case_study_id=study.id,
                        collection_point_id=catalog_point.id,
                        active_in_study=point_row.get("activeInStudy", True),
                        fill_level_kg_override=(
                            Decimal(str(fill_override)) if fill_override is not None else None
                        ),
                        demand_kg_override=(
                            Decimal(str(demand_override)) if demand_override is not None else None
                        ),
                        notes=point_row.get("notes"),
                        sort_order=point_row.get("sortOrder", sort_order),
                    )
                )
            studies_by_code[code] = study
            continue

        for point_row in row.get("points") or []:
            point_code = point_row["collectionPointCode"]
            catalog_point = point_by_code.get(point_code)
            if catalog_point is None:
                raise ValueError(f"Punto desconocido en case_studies.json: {point_code}")

            fill_override = point_row.get("fillLevelKgOverride")
            demand_override = point_row.get("demandKgOverride")
            session.add(
                CaseStudyPoint(
                    case_study_id=study.id,
                    collection_point_id=catalog_point.id,
                    active_in_study=point_row.get("activeInStudy", True),
                    fill_level_kg_override=(
                        Decimal(str(fill_override)) if fill_override is not None else None
                    ),
                    demand_kg_override=(
                        Decimal(str(demand_override)) if demand_override is not None else None
                    ),
                    notes=point_row.get("notes"),
                    sort_order=point_row.get("sortOrder"),
                )
            )

        studies_by_code[code] = study

    session.flush()
    return studies_by_code


def case_study_seed_summary(studies_by_code: dict[str, CaseStudy]) -> dict[str, Any]:
    return {
        "caseStudies": len(studies_by_code),
        "caseStudyCodes": sorted(studies_by_code.keys()),
    }
