"""Tests de idempotencia de operaciones (Fase 4)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.idempotency import run_idempotent


class _FakeIdemDB:
    """Simula la tabla de idempotencia en memoria."""

    def __init__(self) -> None:
        self.record = None

    def scalar(self, _stmt):
        return self.record

    def add(self, obj) -> None:
        self.record = obj

    def flush(self) -> None:
        pass


def test_same_key_replays_result_without_repeating_effect():
    db = _FakeIdemDB()
    calls: list[int] = []

    def handler() -> dict[str, int]:
        calls.append(1)
        return {"count": 2}

    first = run_idempotent(db, scope="dispatch:1", key="abc", handler=handler)
    second = run_idempotent(db, scope="dispatch:1", key="abc", handler=handler)

    assert first == {"count": 2}
    assert second == {"count": 2}
    assert len(calls) == 1  # el efecto se ejecutó una sola vez


def test_without_key_runs_every_time():
    db = _FakeIdemDB()
    calls: list[int] = []

    def handler() -> dict[str, int]:
        calls.append(1)
        return {"count": 1}

    run_idempotent(db, scope="s", key=None, handler=handler)
    run_idempotent(db, scope="s", key=None, handler=handler)

    assert len(calls) == 2


def test_disabled_flag_skips_idempotency():
    db = _FakeIdemDB()
    calls: list[int] = []

    def handler() -> dict[str, int]:
        calls.append(1)
        return {}

    run_idempotent(db, scope="s", key="k", handler=handler, enabled=False)
    run_idempotent(db, scope="s", key="k", handler=handler, enabled=False)

    assert len(calls) == 2


def test_conflict_while_same_key_in_progress():
    db = _FakeIdemDB()
    db.record = SimpleNamespace(status="in_progress", response_json=None)

    with pytest.raises(HTTPException) as exc:
        run_idempotent(db, scope="s", key="k", handler=lambda: {})

    assert exc.value.status_code == 409
