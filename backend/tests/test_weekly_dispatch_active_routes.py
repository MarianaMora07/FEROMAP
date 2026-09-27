"""Regresión: despachar la semana completa no debe completar días anteriores.

``notify_weekly_operational_days`` itera todos los días ``optimized`` de la
semana. Cada iteración llamaba a ``dispatch_optimized_routes`` con
``preserve_active=False``, que primero marca *todas* las rutas ``in_progress``
globales como ``completed``: el lunes resultaba en rutas completadas sin
haberse ejecutado y el conductor no podía confirmar paradas.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import operations_service
from app.services.operations_service import _dedupe_active_routes_by_vehicle
from app.services.weekly_operational_service import notify_weekly_operational_days


def _route(route_id: int, vehicle_id: int, day: date | None):
    return SimpleNamespace(
        id=route_id,
        vehicle_id=vehicle_id,
        daily_plan=SimpleNamespace(operation_date=day) if day is not None else None,
    )


def test_active_routes_dedupe_one_entry_per_vehicle(monkeypatch):
    """Un camión no ejecuta dos rutas a la vez: sin dedupe el mapa se duplica."""

    class _FixedDate(date):
        @classmethod
        def today(cls):
            return date(2026, 9, 27)

    monkeypatch.setattr(operations_service, "date", _FixedDate)

    routes = [
        _route(10, 1, date(2026, 9, 28)),
        _route(11, 1, date(2026, 9, 29)),
        _route(12, 1, date(2026, 10, 2)),
        _route(20, 2, date(2026, 9, 28)),
    ]

    deduped = _dedupe_active_routes_by_vehicle(routes)

    assert [route.id for route in deduped] == [10, 20]


def _optimized_days() -> list[SimpleNamespace]:
    return [
        SimpleNamespace(id=11, operation_date=date(2026, 9, 28)),
        SimpleNamespace(id=12, operation_date=date(2026, 9, 29)),
        SimpleNamespace(id=13, operation_date=date(2026, 9, 30)),
    ]


def test_notify_dispatches_every_day_preserving_active_routes():
    db = MagicMock()
    db.get.return_value = SimpleNamespace(id=7)
    db.scalars.return_value.all.return_value = _optimized_days()

    with (
        patch(
            "app.services.operations_service.dispatch_optimized_routes",
            return_value={"dispatchedRouteIds": [101], "count": 1},
        ) as dispatch,
        patch("app.services.planning_service.mark_daily_plan_dispatched") as mark,
        patch("app.services.notification_service.notify_routes_dispatched") as notify,
    ):
        notified = notify_weekly_operational_days(db, 7)

    assert [row["dailyPlanId"] for row in notified] == [11, 12, 13]
    assert dispatch.call_count == 3
    for call in dispatch.call_args_list:
        assert call.kwargs["daily_plan_id"] in {11, 12, 13}
        assert call.kwargs["preserve_active"] is True
    assert mark.call_count == 3
    assert notify.call_count == 3


def test_notify_without_optimized_days_dispatches_nothing():
    db = MagicMock()
    db.get.return_value = SimpleNamespace(id=7)
    db.scalars.return_value.all.return_value = []

    with patch(
        "app.services.operations_service.dispatch_optimized_routes"
    ) as dispatch:
        notified = notify_weekly_operational_days(db, 7)

    assert notified == []
    dispatch.assert_not_called()
