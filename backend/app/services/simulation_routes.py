"""Rutas GeoJSON persistidas por el último motor de optimización."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Simulation


def latest_computed_routes(db: Session) -> dict[str, Any] | None:
    simulation = db.scalar(
        select(Simulation).order_by(Simulation.executed_at.desc(), Simulation.id.desc()).limit(1)
    )
    if simulation is None or not simulation.parameters_json:
        return None
    params = json.loads(simulation.parameters_json)
    if params.get("engine") != "aco_vrp_osmnx":
        return None
    return params.get("routesGeojson")
