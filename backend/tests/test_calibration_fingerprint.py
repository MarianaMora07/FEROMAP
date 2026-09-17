"""Sello de instancia de la calibración (Fase 13 · vista de calibración).

Cubre el digest, los tres estados de caché (`fresh`/`stale`/`unknown`), el epoch de seed
y el enriquecido que sirven los `GET`.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.api.v1 import benchmarks
from app.services import instance_fingerprint as fp


def _fields() -> dict:
    return {
        "epoch": "2026-09-17T18:00:00+00:00",
        "scenario": "normal",
        "points": {"count": 120, "latest": "2026-09-17T18:00:00+00:00"},
        "vehicles": {"count": 8, "latest": "2026-09-17T18:00:00+00:00"},
        "zones": {"count": 10, "latest": "2026-09-17T18:00:00+00:00"},
        "depot": [8.295, -62.715],
        "landfill": [8.28, -62.69],
        "shiftHours": 12,
    }


# --------------------------------------------------------------------------- #
# Digest
# --------------------------------------------------------------------------- #


def test_fingerprint_digest_is_stable_and_order_independent():
    reordered = {key: _fields()[key] for key in reversed(list(_fields()))}

    assert fp.fingerprint_digest(_fields()) == fp.fingerprint_digest(reordered)
    assert len(fp.fingerprint_digest(_fields())) == 16


def test_fingerprint_digest_changes_with_the_instance():
    other = {**_fields(), "epoch": "2026-09-17T19:00:00+00:00"}

    assert fp.fingerprint_digest(_fields()) != fp.fingerprint_digest(other)


# --------------------------------------------------------------------------- #
# Estados de la caché
# --------------------------------------------------------------------------- #


def test_cache_state_marks_unknown_without_stamp():
    assert fp.cache_state(None, "abc") == "unknown"
    assert fp.cache_state({}, "abc") == "unknown"
    assert fp.cache_state({"instanceFingerprint": None}, "abc") == "unknown"


def test_cache_state_compares_the_stamp():
    assert fp.cache_state({"instanceFingerprint": "abc"}, "abc") == "fresh"
    assert fp.cache_state({"instanceFingerprint": "abc"}, "def") == "stale"


def test_with_freshness_enriches_without_touching_the_payload(monkeypatch):
    payload = {"generatedAt": "2026-09-15T17:55:35+00:00", "scenarioId": "normal", "runs": []}
    monkeypatch.setattr(fp, "current_fingerprint", lambda db, *, scenario_id: "vigente")

    enriched = fp.with_freshness(payload, MagicMock(), scenario_id="normal")

    assert enriched["currentFingerprint"] == "vigente"
    assert enriched["cacheState"] == "unknown"  # payload sin sello (anterior)
    assert enriched["stale"] is False
    assert enriched["instanceFingerprint"] is None
    # El payload original no se modifica.
    assert "currentFingerprint" not in payload


def test_with_freshness_flags_a_stale_cache(monkeypatch):
    payload = {"scenarioId": "normal", "instanceFingerprint": "viejo"}
    monkeypatch.setattr(fp, "current_fingerprint", lambda db, *, scenario_id: "vigente")

    enriched = fp.with_freshness(payload, MagicMock(), scenario_id="normal")

    assert enriched["cacheState"] == "stale"
    assert enriched["stale"] is True


# --------------------------------------------------------------------------- #
# Epoch de seed
# --------------------------------------------------------------------------- #


def test_seed_epoch_roundtrip(tmp_path, monkeypatch):
    path = tmp_path / "seed_epoch.json"
    monkeypatch.setattr(fp, "seed_epoch_path", lambda: path)

    assert fp.seed_epoch() is None

    fp.write_seed_epoch()
    epoch = fp.seed_epoch()

    assert epoch is not None and epoch.startswith("20")
    assert path.exists()


def test_seed_epoch_tolerates_a_corrupt_file(tmp_path, monkeypatch):
    path = tmp_path / "seed_epoch.json"
    path.write_text("{no-json", encoding="utf-8")
    monkeypatch.setattr(fp, "seed_epoch_path", lambda: path)

    assert fp.seed_epoch() is None


# --------------------------------------------------------------------------- #
# Campos de la instancia
# --------------------------------------------------------------------------- #


class _FakeDb:
    """Sesión mínima: devuelve filas canónicas para los agregados."""

    def __init__(self, *, points=(120, None), vehicles=(8, None), zones=(10, None)) -> None:
        self._rows = [points, vehicles, zones]
        self._index = 0

    def execute(self, _stmt):
        row = self._rows[self._index]
        self._index += 1
        return SimpleNamespace(one=lambda: row)


def test_instance_fingerprint_fields_describe_the_instance(monkeypatch):
    monkeypatch.setattr(fp, "seed_epoch", lambda: "epoch-1")
    monkeypatch.setattr(
        fp,
        "get_operational_settings",
        lambda db: SimpleNamespace(depot_lat=8.29512, depot_lon=-62.71547, landfill_lat=8.28, landfill_lon=-62.69),
    )
    monkeypatch.setattr(
        fp, "get_algorithm_settings", lambda db: SimpleNamespace(default_shift_hours=12)
    )

    fields = fp.instance_fingerprint_fields(_FakeDb(), scenario_id="rain")

    assert fields["epoch"] == "epoch-1"
    assert fields["scenario"] == "rain"
    assert fields["points"] == {"count": 120, "latest": None}
    assert fields["vehicles"]["count"] == 8
    assert fields["zones"]["count"] == 10
    assert fields["depot"] == [8.29512, -62.71547]
    assert fields["shiftHours"] == 12


def test_instance_fingerprint_fields_handles_an_empty_db(monkeypatch):
    monkeypatch.setattr(fp, "seed_epoch", lambda: None)
    monkeypatch.setattr(
        fp,
        "get_operational_settings",
        lambda db: SimpleNamespace(depot_lat=8.0, depot_lon=-62.0, landfill_lat=8.1, landfill_lon=-62.1),
    )
    monkeypatch.setattr(
        fp, "get_algorithm_settings", lambda db: SimpleNamespace(default_shift_hours=None)
    )

    fields = fp.instance_fingerprint_fields(
        _FakeDb(points=(None, None), vehicles=(None, None), zones=(None, None)),
        scenario_id="normal",
    )

    assert fields["points"]["count"] == 0
    assert fields["vehicles"]["count"] == 0
    assert fields["epoch"] is None
    assert fields["shiftHours"] is None


# --------------------------------------------------------------------------- #
# Endpoints: el estado viaja en la lectura
# --------------------------------------------------------------------------- #


def test_sensitivity_get_reports_the_cache_state(monkeypatch):
    payload = {"generatedAt": "2026-09-17T15:29:10+00:00", "scenarioId": "normal", "runs": []}
    captured: dict = {}

    def fake_freshness(payload_, db, *, scenario_id):
        captured["scenario"] = scenario_id
        return {**payload_, "cacheState": "stale", "stale": True}

    monkeypatch.setattr(benchmarks, "load_aco_sensitivity", lambda: payload)
    monkeypatch.setattr(benchmarks, "with_freshness", fake_freshness)

    result = benchmarks.get_aco_sensitivity(MagicMock(), MagicMock())

    assert result["stale"] is True
    # El escenario del propio payload es el que se sella.
    assert captured["scenario"] == "normal"


def test_sensitivity_get_uses_the_default_scenario_without_payload_field(monkeypatch):
    captured: dict = {}

    def fake_freshness(payload_, db, *, scenario_id):
        captured["scenario"] = scenario_id
        return payload_

    monkeypatch.setattr(benchmarks, "load_aco_sensitivity", lambda: {"runs": []})
    monkeypatch.setattr(benchmarks, "with_freshness", fake_freshness)

    benchmarks.get_aco_sensitivity(MagicMock(), MagicMock())

    assert captured["scenario"] == "normal"


def test_calibration_payloads_are_stamped_on_save(monkeypatch):
    from app.services import aco_sensitivity_service as aco
    from app.services import multiobjective_sweep_service as sweep

    def fake_engine(db_, scenario_id, **kwargs):
        return {
            "kpis": {
                "distanceKm": {"current": 10.0, "optimized": 8.0},
                "uncoveredPoints": 0,
                "engineMetrics": {"computationSeconds": 1.0},
            }
        }

    saved: dict = {}
    monkeypatch.setattr(aco, "run_optimization_engine", fake_engine)
    monkeypatch.setattr(sweep, "run_optimization_engine", fake_engine)
    monkeypatch.setattr(aco, "save_aco_sensitivity", lambda payload: saved.update({"aco": payload}))
    monkeypatch.setattr(
        sweep, "save_multiobjective_sweep", lambda payload: saved.update({"sweep": payload})
    )

    aco_payload = aco.run_aco_sensitivity(MagicMock(), seed=7, instance_fingerprint="sello-aco")
    sweep_payload = sweep.run_multiobjective_sweep(
        MagicMock(), seed=7, instance_fingerprint="sello-sweep"
    )

    assert aco_payload["instanceFingerprint"] == "sello-aco"
    assert sweep_payload["instanceFingerprint"] == "sello-sweep"
    assert saved["aco"]["instanceFingerprint"] == "sello-aco"
    assert saved["sweep"]["instanceFingerprint"] == "sello-sweep"


def test_calibration_payloads_without_stamp_stay_unknown(monkeypatch):
    from app.services import aco_sensitivity_service as aco

    monkeypatch.setattr(
        aco,
        "run_optimization_engine",
        lambda db_, scenario_id, **kwargs: {
            "kpis": {
                "distanceKm": {"current": 10.0, "optimized": 8.0},
                "uncoveredPoints": 0,
                "engineMetrics": {"computationSeconds": 1.0},
            }
        },
    )
    monkeypatch.setattr(aco, "save_aco_sensitivity", lambda payload: None)

    payload = aco.run_aco_sensitivity(MagicMock())

    assert payload["instanceFingerprint"] is None
    assert fp.cache_state(payload, "cualquier-cosa") == "unknown"
