"""Próxima visita por contenedor: plan semanal aprobado > agenda declarada."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.next_visit_service import (
    SOURCE_AGENDA,
    SOURCE_PLAN,
    declared_weekdays_by_point,
    next_visits_by_point,
    planned_dates_by_point,
)


def _plan_day(operation_date: date, point_ids: list[int]) -> SimpleNamespace:
    return SimpleNamespace(
        operation_date=operation_date,
        collection_point_ids_json=json.dumps(point_ids),
        sector_ids_json=None,
    )


def _schedule(point_id: int, weekdays: list[int]) -> SimpleNamespace:
    return SimpleNamespace(collection_point_id=point_id, weekdays_json=json.dumps(weekdays))


def _db(plan_days: list[SimpleNamespace], schedules: list[SimpleNamespace]) -> MagicMock:
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=plan_days)),
        MagicMock(all=MagicMock(return_value=schedules)),
    ]
    return db


# El instante de referencia (2026-09-17 00:00 UTC) es miércoles 20:00 en Caracas.
AT = datetime(2026, 9, 17, 0, 0, tzinfo=timezone.utc)


def test_planified_date_wins_over_declared_agenda():
    """El plan aprobado manda aunque la agenda prometa una visita antes."""
    db = _db(
        [_plan_day(date(2026, 9, 23), [93])],
        [_schedule(93, [4])],  # agenda: viernes 18/09 07:00 local ≈ 35 h
    )

    visits = next_visits_by_point(db, at=AT)

    # Gana el plan: miércoles 23/09 07:00 local = 11:00 UTC → 155 h.
    assert visits[93].hours == 155.0
    assert visits[93].source == SOURCE_PLAN
    assert visits[93].local_date == date(2026, 9, 23)


def test_falls_back_to_declared_agenda_without_plan():
    db = _db([], [_schedule(81, [0])])  # lunes

    visits = next_visits_by_point(db, at=AT)

    # Lunes 21/09 07:00 local = 11:00 UTC → 107 h.
    assert visits[81].hours == 107.0
    assert visits[81].source == SOURCE_AGENDA
    assert visits[81].local_date == date(2026, 9, 21)


def test_without_plan_or_agenda_the_point_is_not_evaluable():
    db = _db([], [_schedule(1, [0])])

    visits = next_visits_by_point(db, at=AT)

    assert 1 in visits
    # Un punto sin plan ni agenda no aparece: se reporta como no evaluable.
    assert 2 not in visits


def test_declared_weekdays_loader_skips_malformed_rows():
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(
            all=MagicMock(
                return_value=[
                    _schedule(1, [0, 2]),
                    SimpleNamespace(collection_point_id=2, weekdays_json="{no json"),
                    SimpleNamespace(collection_point_id=None, weekdays_json="[1]"),
                    SimpleNamespace(collection_point_id=3, weekdays_json=None),
                ]
            )
        )
    ]

    assert declared_weekdays_by_point(db) == {1: [0, 2]}


def test_planned_dates_are_gathered_per_point():
    db = MagicMock()
    db.scalars.side_effect = [
        MagicMock(
            all=MagicMock(
                return_value=[
                    _plan_day(date(2026, 9, 23), [93, 94]),
                    _plan_day(date(2026, 9, 25), [93]),
                ]
            )
        )
    ]

    planned = planned_dates_by_point(db, today=date(2026, 9, 17))

    assert planned[93] == {date(2026, 9, 23), date(2026, 9, 25)}
    assert planned[94] == {date(2026, 9, 23)}


def test_visit_hour_is_local_not_utc():
    # 09:00 UTC = 05:00 en Caracas: la visita de hoy (07:00 local = 11:00 UTC)
    # aún no ocurrió, así que faltan 2 h (no 0 h como con la hora en UTC).
    db = _db([_plan_day(date(2026, 9, 17), [1])], [])

    visits = next_visits_by_point(db, at=datetime(2026, 9, 17, 9, 0, tzinfo=timezone.utc))

    assert visits[1].hours == 2.0
    assert visits[1].source == SOURCE_PLAN


def test_past_planned_visit_falls_back_to_agenda():
    # 12:00 UTC = 08:00 en Caracas: la recolección de hoy ya pasó.
    db = _db([_plan_day(date(2026, 9, 17), [1])], [_schedule(1, [4])])

    visits = next_visits_by_point(db, at=datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc))

    # Cae a la agenda: viernes 18/09 07:00 local = 11:00 UTC → 23 h.
    assert visits[1].hours == 23.0
    assert visits[1].source == SOURCE_AGENDA
    assert visits[1].local_date == date(2026, 9, 18)
