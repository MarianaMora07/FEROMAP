"""Tests de persistencia y recuperación de jobs (Tarea 8)."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import optimization_job_service as svc


class _ScalarResult:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def all(self) -> list:
        return self._rows


class _FakeDb:
    def __init__(self, rows: list, total: int = 0) -> None:
        self._rows = rows
        self._total = total
        self.committed = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def scalars(self, _stmt) -> _ScalarResult:
        return _ScalarResult(self._rows)

    def scalar(self, _stmt) -> int:
        return self._total

    def commit(self) -> None:
        self.committed += 1


def _row(job_id: str, status: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=job_id,
        job_type="simulation",
        status=status,
        phase=None,
        progress=0,
        created_at=datetime.now(timezone.utc),
        started_at=None,
        finished_at=None,
        error=None,
    )


def test_list_job_records_returns_items(monkeypatch):
    fake = _FakeDb([_row("job-1", "completed"), _row("job-2", "failed")], total=2)
    monkeypatch.setattr(svc, "SessionLocal", lambda: fake)

    payload = svc.list_job_records(limit=10)
    assert payload["total"] == 2
    assert len(payload["items"]) == 2
    assert payload["items"][0]["id"] == "job-1"
    assert payload["items"][0]["status"] == "completed"


def test_recover_orphan_jobs_marks_pending_and_running_as_failed(monkeypatch):
    rows = [_row("job-a", "running"), _row("job-b", "pending"), _row("job-c", "completed")]
    fake = _FakeDb(rows)
    monkeypatch.setattr(svc, "SessionLocal", lambda: fake)

    recovered = svc.recover_orphan_jobs()
    assert recovered == 2
    running = rows[0]
    assert running.status == "failed"
    assert running.error == "Interrumpido por reinicio del servidor"
    assert running.finished_at is not None
    assert rows[2].status == "completed"
    assert fake.committed >= 1
