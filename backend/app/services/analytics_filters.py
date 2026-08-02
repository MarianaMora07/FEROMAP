from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.db.models import Simulation
from app.services.reports_service import _parse_simulation

Granularity = Literal["daily", "weekly", "monthly"]


@dataclass(frozen=True)
class AnalyticsFilters:
    date_from: date | None = None
    date_to: date | None = None
    granularity: Granularity = "daily"
    sector: str | None = None


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def parse_granularity(value: str | None) -> Granularity:
    if value in ("daily", "weekly", "monthly"):
        return value
    return "daily"


def build_filters(
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    granularity: str | None = None,
    sector: str | None = None,
) -> AnalyticsFilters:
    return AnalyticsFilters(
        date_from=parse_iso_date(from_date),
        date_to=parse_iso_date(to_date),
        granularity=parse_granularity(granularity),
        sector=sector.strip() if sector and sector.strip() else None,
    )


def _range_bounds(filters: AnalyticsFilters) -> tuple[datetime | None, datetime | None]:
    start = None
    end = None
    if filters.date_from:
        start = datetime.combine(filters.date_from, time.min, tzinfo=timezone.utc)
    if filters.date_to:
        end = datetime.combine(filters.date_to, time.max.replace(microsecond=0), tzinfo=timezone.utc)
    return start, end


def filtered_simulations_stmt(filters: AnalyticsFilters) -> Select[tuple[Simulation]]:
    stmt = select(Simulation).order_by(Simulation.executed_at.asc())
    start, end = _range_bounds(filters)
    if start is not None:
        stmt = stmt.where(Simulation.executed_at >= start)
    if end is not None:
        stmt = stmt.where(Simulation.executed_at <= end)
    return stmt


def load_simulation_rows(db: Session, filters: AnalyticsFilters) -> list[dict[str, Any]]:
    simulations = db.scalars(filtered_simulations_stmt(filters)).all()
    return [_parse_simulation(sim) for sim in simulations]


def _bucket_key(dt: datetime | None, granularity: Granularity) -> str:
    if dt is None:
        return "unknown"
    if granularity == "monthly":
        return dt.strftime("%Y-%m")
    if granularity == "weekly":
        week_start = dt.date() - timedelta(days=dt.weekday())
        return week_start.isoformat()
    return dt.date().isoformat()


def _bucket_label(key: str, granularity: Granularity) -> str:
    if key == "unknown":
        return "—"
    if granularity == "monthly":
        year, month = key.split("-")
        months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        return f"{months[int(month) - 1]} {year}"
    parsed = date.fromisoformat(key)
    return parsed.strftime("%d %b")


def bucket_evolution_series(
    rows: list[dict[str, Any]],
    granularity: Granularity,
) -> dict[str, list[Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        executed = row.get("executedAt")
        dt = datetime.fromisoformat(executed) if executed else None
        buckets[_bucket_key(dt, granularity)].append(row)

    ordered_keys = sorted(key for key in buckets if key != "unknown")
    if "unknown" in buckets:
        ordered_keys.append("unknown")

    labels = [_bucket_label(key, granularity) for key in ordered_keys]
    collections: list[int] = []
    tons: list[float] = []
    distance_km: list[float] = []
    saving_pct: list[float] = []

    for key in ordered_keys:
        group = buckets[key]
        served = sum(int(row.get("containersServed") or 0) for row in group)
        collections.append(served)
        tons.append(round(served * 0.12, 1))
        distance_km.append(round(sum(row["distanceOptimizedKm"] for row in group), 1))
        saving_pct.append(round(sum(row["savingPercentage"] for row in group) / max(len(group), 1), 1))

    return {
        "labels": labels,
        "collections": collections,
        "tons": tons,
        "distanceKm": distance_km,
        "savingPct": saving_pct,
    }


def hourly_distribution_from_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    hour_bins = [0] * 12
    hour_labels = [f"{hour:02d}:00" for hour in range(6, 18)]
    for row in rows:
        executed = row.get("executedAt")
        if not executed:
            continue
        dt = datetime.fromisoformat(executed)
        hour = dt.hour
        if 6 <= hour <= 17:
            served = int(row.get("containersServed") or 0)
            hour_bins[hour - 6] += max(served, 1)

    return {
        "labels": hour_labels,
        "toneladas": [round(value * 0.12, 1) for value in hour_bins],
        "recolecciones": hour_bins,
    }
