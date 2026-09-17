"""Almacén de evidencia de calibración (Fase 13 · vista de calibración).

Cubre el resumen tipado, la lectura «vigente» (fila más reciente), el historial y el sello
de instancia que sirven los `GET`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import calibration_sweep_store as store


class _ScalarResult:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def all(self) -> list:
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeDb:
    """Sesión mínima: filas canónicas, registro de altas y contadores."""

    def __init__(self, rows: list | None = None, total: int | None = None) -> None:
        self._rows = list(rows or [])
        self._total = len(self._rows) if total is None else total
        self.added: list = []
        self.committed = 0
        self.refreshed = 0

    def add(self, record) -> None:
        self.added.append(record)

    def commit(self) -> None:
        self.committed += 1

    def refresh(self, _record) -> None:
        self.refreshed += 1

    def scalars(self, _stmt) -> _ScalarResult:
        return _ScalarResult(self._rows)

    def scalar(self, _stmt) -> int:
        return self._total

    def get(self, _model, _pk):
        return self._rows[0] if self._rows else None


def _row(
    run_id: int = 1,
    *,
    sweep: str = "sensitivity",
    scenario_id: str = "normal",
    seed: int = 42,
    fingerprint: str | None = "sello-a",
    payload: dict | None = None,
    payload_json: str | None = None,
    duration_seconds: float | None = 315.4,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=run_id,
        sweep=sweep,
        scenario_id=scenario_id,
        seed=seed,
        duration_seconds=duration_seconds,
        runs_total=18,
        runs_failed=0,
        best_distance_km=184.7,
        instance_fingerprint=fingerprint,
        payload_json=payload_json
        if payload_json is not None
        else json.dumps(payload if payload is not None else {"runs": []}),
        created_at=datetime(2026, 9, 17, 15, 29, 10, tzinfo=timezone.utc),
    )


# --------------------------------------------------------------------------- #
# Alta
# --------------------------------------------------------------------------- #


def test_record_sweep_summarises_the_payload():
    db = _FakeDb()
    payload = {
        "generatedAt": "2026-09-17T12:30:00+00:00",
        "durationSeconds": 12.5,
        "scenarioId": "rain",
        "seed": 7,
        "runs": [
            {"label": "ok", "distanceKmOptimized": 190.8},
            {"label": "mejor", "distanceKmOptimized": 184.7},
            {"label": "rota", "error": "ACO agotó el tiempo"},
        ],
    }

    store.record_sweep(db, sweep="sensitivity", payload=payload)

    assert db.committed == 1 and db.refreshed == 1
    record = db.added[0]
    assert record.sweep == "sensitivity"
    assert record.scenario_id == "rain"
    assert record.seed == 7
    assert float(record.duration_seconds) == 12.5
    assert record.runs_total == 3
    assert record.runs_failed == 1
    # El KPI primario (D2) ignora las corridas con error.
    assert float(record.best_distance_km) == 184.7
    assert record.generated_at.isoformat().startswith("2026-09-17T12:30:00")
    assert json.loads(record.payload_json) == payload


def test_record_sweep_tolerates_a_payload_without_runs_or_seed():
    db = _FakeDb()

    store.record_sweep(db, sweep="objective", payload={"scenarioId": "normal"})

    record = db.added[0]
    assert record.runs_total == 0
    assert record.runs_failed == 0
    assert record.best_distance_km is None
    assert record.seed == 0
    assert record.duration_seconds is None


def test_record_sweep_keeps_the_explicit_fingerprint():
    db = _FakeDb()

    store.record_sweep(
        db, sweep="validation", payload={"runs": []}, instance_fingerprint="sello-explicito"
    )

    assert db.added[0].instance_fingerprint == "sello-explicito"


# --------------------------------------------------------------------------- #
# Lectura vigente
# --------------------------------------------------------------------------- #


def test_latest_payload_returns_the_most_recent_row():
    payload = {"scenarioId": "normal", "runs": [{"label": "β 5"}]}
    db = _FakeDb([_row(3, payload=payload)])

    assert store.latest_payload(db, sweep="sensitivity") == payload


def test_latest_payload_is_none_without_rows_or_with_a_corrupt_one():
    assert store.latest_payload(_FakeDb([]), sweep="sensitivity") is None
    corrupt = _FakeDb([_row(1, payload_json="{no-json")])

    assert store.latest_payload(corrupt, sweep="sensitivity") is None


# --------------------------------------------------------------------------- #
# Historial y sello
# --------------------------------------------------------------------------- #


def test_list_sweeps_marks_each_run_against_the_current_instance(monkeypatch):
    rows = [
        _row(3, fingerprint="vigente"),
        _row(2, fingerprint="otra-instancia", sweep="objective"),
        _row(1, fingerprint=None),
    ]
    monkeypatch.setattr(store, "current_fingerprint", lambda db, *, scenario_id: "vigente")

    page = store.list_sweeps(_FakeDb(rows))

    assert page["total"] == 3
    assert [item["cacheState"] for item in page["items"]] == ["fresh", "stale", "unknown"]
    assert [item["stale"] for item in page["items"]] == [False, True, False]
    assert page["items"][1]["sweep"] == "objective"
    # El id entero viaja como texto para no cambiar el contrato del frontend.
    assert page["items"][0]["runId"] == "3"
    assert page["items"][0]["createdAt"].startswith("2026-09-17")
    assert page["items"][0]["durationSeconds"] == 315.4
    assert page["limit"] == 20


def test_list_sweeps_queries_the_fingerprint_once_per_scenario(monkeypatch):
    calls: list[str] = []
    rows = [
        _row(3, scenario_id="normal", fingerprint="x"),
        _row(2, scenario_id="normal", fingerprint="x"),
        _row(1, scenario_id="rain", fingerprint="x"),
    ]

    def fake_current(db, *, scenario_id):
        calls.append(scenario_id)
        return "vigente"

    monkeypatch.setattr(store, "current_fingerprint", fake_current)

    store.list_sweeps(_FakeDb(rows))

    assert calls == ["normal", "rain"]


def test_get_sweep_returns_the_stored_payload(monkeypatch):
    payload = {"scenarioId": "normal", "seed": 42, "runs": [{"label": "β 5"}]}
    db = _FakeDb([_row(7, payload=payload, fingerprint="vigente")])
    monkeypatch.setattr(store, "current_fingerprint", lambda db_, *, scenario_id: "vigente")

    run = store.get_sweep(db, "7")

    assert run is not None
    assert run["payload"] == payload
    assert run["runId"] == "7"
    assert run["sweep"] == "sensitivity"
    assert run["seed"] == 42
    assert run["cacheState"] == "fresh"
    assert run["stale"] is False


def test_get_sweep_is_stale_when_the_instance_changed(monkeypatch):
    db = _FakeDb([_row(1, payload={"runs": []}, fingerprint="otra")])
    monkeypatch.setattr(store, "current_fingerprint", lambda db_, *, scenario_id: "vigente")

    run = store.get_sweep(db, "1")

    assert run is not None and run["stale"] is True


def test_get_sweep_rejects_unknown_ids_and_corrupt_payloads():
    assert store.get_sweep(_FakeDb([]), "1") is None
    assert store.get_sweep(_FakeDb([_row(1)]), "no-un-entero") is None
    assert store.get_sweep(_FakeDb([_row(1, payload_json="{no-json")]), "1") is None
