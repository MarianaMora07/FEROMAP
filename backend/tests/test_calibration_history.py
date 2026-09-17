"""Historial de corridas de calibración (Fase 13 · vista de calibración)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import calibration_history_service as ch


class _ScalarResult:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def all(self) -> list:
        return self._rows


class _FakeDb:
    def __init__(self, rows: list, total: int | None = None) -> None:
        self._rows = rows
        self._total = len(rows) if total is None else total
        self.added: list = []
        self.committed = 0

    def add(self, record) -> None:
        self.added.append(record)

    def commit(self) -> None:
        self.committed += 1

    def scalars(self, _stmt) -> _ScalarResult:
        return _ScalarResult(self._rows)

    def scalar(self, _stmt) -> int:
        return self._total

    def get(self, _model, _pk):
        return self._rows[0] if self._rows else None


def _row(
    run_id: str,
    *,
    sweep: str = "sensitivity",
    scenario_id: str = "normal",
    seed: int = 42,
    fingerprint: str | None = "sello-a",
    payload: dict | None = None,
    job_type: str = "calibration",
    result_json: str | None = "{}",
) -> SimpleNamespace:
    params = {
        "sweep": sweep,
        "scenario_id": scenario_id,
        "seed": seed,
        "instanceFingerprint": fingerprint,
        "durationSeconds": 315.4,
    }
    return SimpleNamespace(
        id=run_id,
        job_type=job_type,
        status="completed",
        phase=ch.HISTORY_PHASE,
        progress=100,
        params_json=json.dumps(params),
        result_json=json.dumps(payload) if payload is not None else result_json,
        created_at=datetime(2026, 9, 17, 15, 29, 10, tzinfo=timezone.utc),
    )


def test_record_calibration_run_persists_params_and_payload():
    db = _FakeDb([])
    payload = {
        "scenarioId": "rain",
        "seed": 7,
        "durationSeconds": 12.5,
        "instanceFingerprint": "sello-x",
        "runs": [{"label": "8 hormigas"}],
    }

    run_id = ch.record_calibration_run(db, sweep="sensitivity", payload=payload)

    assert run_id
    assert db.committed == 1
    record = db.added[0]
    params = json.loads(record.params_json)
    assert params["sweep"] == "sensitivity"
    assert params["scenario_id"] == "rain"
    assert params["seed"] == 7
    assert params["instanceFingerprint"] == "sello-x"
    assert json.loads(record.result_json) == payload
    assert record.job_type == "calibration"
    assert record.status == "completed"
    assert record.phase == ch.HISTORY_PHASE


def test_list_calibration_runs_marks_each_run_against_the_current_instance(monkeypatch):
    rows = [
        _row("run-fresca", fingerprint="vigente"),
        _row("run-vieja", fingerprint="otra-instancia", sweep="objective"),
        _row("run-sin-sello", fingerprint=None),
    ]
    monkeypatch.setattr(ch, "current_fingerprint", lambda db, *, scenario_id: "vigente")

    payload = ch.list_calibration_runs(_FakeDb(rows))

    assert payload["total"] == 3
    assert [item["cacheState"] for item in payload["items"]] == ["fresh", "stale", "unknown"]
    assert [item["stale"] for item in payload["items"]] == [False, True, False]
    assert payload["items"][1]["sweep"] == "objective"
    assert payload["items"][0]["runId"] == "run-fresca"
    assert payload["items"][0]["createdAt"].startswith("2026-09-17")
    assert payload["limit"] == 20


def test_list_calibration_runs_queries_the_fingerprint_once_per_scenario(monkeypatch):
    calls: list[str] = []
    rows = [
        _row("a", scenario_id="normal", fingerprint="x"),
        _row("b", scenario_id="normal", fingerprint="x"),
        _row("c", scenario_id="rain", fingerprint="x"),
    ]

    def fake_current(db, *, scenario_id):
        calls.append(scenario_id)
        return "vigente"

    monkeypatch.setattr(ch, "current_fingerprint", fake_current)

    ch.list_calibration_runs(_FakeDb(rows))

    assert calls == ["normal", "rain"]


def test_get_calibration_run_returns_the_historical_payload(monkeypatch):
    payload = {"scenarioId": "normal", "seed": 42, "runs": [{"label": "β 5"}]}
    db = _FakeDb([_row("run-1", payload=payload, fingerprint="vigente")])
    monkeypatch.setattr(ch, "current_fingerprint", lambda db_, *, scenario_id: "vigente")

    run = ch.get_calibration_run(db, "run-1")

    assert run is not None
    assert run["payload"] == payload
    assert run["sweep"] == "sensitivity"
    assert run["seed"] == 42
    assert run["cacheState"] == "fresh"
    assert run["stale"] is False


def test_get_calibration_run_is_stale_when_the_instance_changed(monkeypatch):
    db = _FakeDb([_row("run-1", payload={"runs": []}, fingerprint="otra")])
    monkeypatch.setattr(ch, "current_fingerprint", lambda db_, *, scenario_id: "vigente")

    run = ch.get_calibration_run(db, "run-1")

    assert run is not None and run["stale"] is True


def test_get_calibration_run_ignores_other_job_types_and_missing_results(monkeypatch):
    monkeypatch.setattr(ch, "current_fingerprint", lambda db_, *, scenario_id: "vigente")

    assert ch.get_calibration_run(_FakeDb([]), "run-x") is None
    assert (
        ch.get_calibration_run(
            _FakeDb([_row("run-y", job_type="simulation", payload={"runs": []})]), "run-y"
        )
        is None
    )
    assert (
        ch.get_calibration_run(
            _FakeDb([_row("run-z", result_json=None)]), "run-z"
        )
        is None
    )


def test_get_calibration_run_tolerates_a_corrupt_payload(monkeypatch):
    monkeypatch.setattr(ch, "current_fingerprint", lambda db_, *, scenario_id: "vigente")
    db = _FakeDb([_row("run-rota", result_json="{no-json")])

    assert ch.get_calibration_run(db, "run-rota") is None
