"""Tests de consumidores avanzados de criticidad (Fase 7)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services import operations_service, planning_service
from app.services.aco_parallel import _pick_candidate


class _FixedRng:
    """RNG determinista para aislar la ponderación de `_pick_candidate`."""

    def __init__(self, value: float) -> None:
        self._value = value

    def random(self) -> float:
        return self._value

    def choice(self, seq):  # pragma: no cover - solo compatibilidad
        return seq[0]


def _pheromone() -> list[list[float]]:
    return [[1.0, 1.0, 1.0] for _ in range(3)]


def _dist() -> list[list[float]]:
    return [[0.0, 100.0, 100.0], [100.0, 0.0, 100.0], [100.0, 100.0, 0.0]]


# --- ACO: el riesgo de calendario domina sobre el llenado --------------------


def test_pick_candidate_prioritizes_at_risk():
    chosen = _pick_candidate(
        _FixedRng(0.5),
        0,
        [1, 2],
        _pheromone(),
        _dist(),
        alpha=1.0,
        beta=1.0,
        fill_pcts=[0, 0],
        priority_fill_level=True,
        at_risk_flags=[False, True],
    )
    assert chosen == 2


def test_pick_candidate_without_risk_ties_pick_first():
    chosen = _pick_candidate(
        _FixedRng(0.5),
        0,
        [1, 2],
        _pheromone(),
        _dist(),
        alpha=1.0,
        beta=1.0,
        fill_pcts=[0, 0],
        priority_fill_level=True,
    )
    assert chosen == 1


# --- compute_pending_priority: overloaded ------------------------------------


def test_compute_pending_priority_adds_overload_boost():
    today = date.today()
    base = planning_service.compute_pending_priority(today, None)
    assert planning_service.compute_pending_priority(today, None, overloaded=True) == base + 25


# --- Alertas: categoría de agenda --------------------------------------------


def _point(point_id: int, code: str, fill_pct: float) -> SimpleNamespace:
    capacity = 1000.0
    return SimpleNamespace(
        id=point_id,
        code=code,
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(capacity * fill_pct / 100)),
        estimated_fill_hours=72.0,
        last_emptied_at=None,
        status="active",
        sector=SimpleNamespace(name="Unare I", id=1),
        longitude=Decimal("-62.75"),
        latitude=Decimal("8.278"),
    )


def test_alerts_include_agenda_category(monkeypatch):
    points = [_point(1, "CNT-001", 79.0), _point(2, "CNT-002", 95.0)]
    schedules = [
        SimpleNamespace(collection_point_id=1, weekdays_json="[0]"),
        SimpleNamespace(collection_point_id=2, weekdays_json="[0]"),
    ]
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=points)),
        MagicMock(all=MagicMock(return_value=schedules)),
        MagicMock(all=MagicMock(return_value=[])),  # vehicles
        MagicMock(all=MagicMock(return_value=[])),  # incidents
    ]
    monkeypatch.setattr(
        operations_service,
        "is_at_risk_before_next_visit",
        lambda point, *, weekdays: True,
    )

    alerts = operations_service.alerts_from_db(db)
    agenda = [alert for alert in alerts if alert["category"] == "agenda"]

    # Solo el punto no crítico genera alerta de agenda.
    assert [alert["id"] for alert in agenda] == ["al-agenda-CNT-001"]
    assert agenda[0]["priority"] == "advertencia"
