"""Tests de la validación estadística: tamaño del efecto y familia multi-escenario.

Cubre las funciones puras nuevas (`rank_biserial`, `cohen_dz`) y la orquestación
`run_statistical_validations` con el motor monkeypatcheado (sin ACO real) y el ajuste de
Holm sobre la familia pre-declarada.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import statistical_validation as sv


def _engine(current: float, optimized_fn):
    """Motor falso: distancia optimizada por semilla, registrada en el resultado."""

    def fake_run(db_, scenario_id, **kwargs):
        seed = kwargs.get("seed", 1)
        return {
            "kpis": {"distanceKm": {"current": current, "optimized": optimized_fn(seed)}},
        }

    return fake_run


# --------------------------------------------------------------------------- #
# rank_biserial
# --------------------------------------------------------------------------- #


def test_rank_biserial_is_one_when_all_differences_share_sign():
    assert sv.rank_biserial([1.0, 2.0, 3.0, 4.0, 5.0]) == pytest.approx(1.0)
    assert sv.rank_biserial([-1.0, -2.0, -3.0]) == pytest.approx(-1.0)


def test_rank_biserial_cancels_symmetric_differences_to_zero():
    assert sv.rank_biserial([1.0, -1.0]) == pytest.approx(0.0)


def test_rank_biserial_ignores_zeros_and_degenerates_gracefully():
    assert sv.rank_biserial([0.0, 0.0]) is None
    assert sv.rank_biserial([]) is None
    # Los ceros no cuentan como evidencia, pero el resto sí.
    assert sv.rank_biserial([0.0, 2.0, 4.0]) == pytest.approx(1.0)


# --------------------------------------------------------------------------- #
# cohen_dz
# --------------------------------------------------------------------------- #


def test_cohen_dz_needs_variation_and_a_sample():
    assert sv.cohen_dz([1.0]) is None
    assert sv.cohen_dz([1.0, 1.0, 1.0]) is None  # desviación estándar nula


def test_cohen_dz_is_mean_over_stdev():
    # media 4 · desviación muestral 2 → d_z = 2
    assert sv.cohen_dz([2.0, 4.0, 6.0]) == pytest.approx(2.0)


# --------------------------------------------------------------------------- #
# run_statistical_validation — tamaño del efecto
# --------------------------------------------------------------------------- #


def test_run_statistical_validation_reports_effect_size(monkeypatch):
    monkeypatch.setattr(sv, "run_optimization_engine", _engine(100.0, lambda seed: 100.0 - seed))
    db = MagicMock()

    result = sv.run_statistical_validation(db, scenario_id="normal", n_runs=6)

    assert result.n_effective == 6
    assert result.effect_size_r == pytest.approx(1.0)
    assert result.effect_size_dz is not None and result.effect_size_dz > 0
    assert result.wilcoxon_p_value is not None
    db.add.assert_called_once()


# --------------------------------------------------------------------------- #
# run_statistical_validations — familia + Holm
# --------------------------------------------------------------------------- #


def test_run_statistical_validations_applies_holm_over_the_family(monkeypatch):
    monkeypatch.setattr(sv, "run_optimization_engine", _engine(100.0, lambda seed: 100.0 - seed))
    db = MagicMock()

    payload = sv.run_statistical_validations(db, scenario_ids=("normal", "rain"), n_runs=6)

    assert payload["family"] == ["normal", "rain"]
    assert [row["scenarioId"] for row in payload["validations"]] == ["normal", "rain"]
    for row in payload["validations"]:
        assert row["wilcoxon"]["pValue"] is not None
        assert row["pValueHolm"] is not None
        assert row["pValueHolm"] >= row["wilcoxon"]["pValue"]
        assert row["effectSize"]["rankBiserial"] == pytest.approx(1.0)
    assert db.add.call_count == 2


def test_run_statistical_validations_leaves_holm_none_without_sample(monkeypatch):
    # Con 4 pares no nulos (< 5) el contraste no se realiza: p y p Holm quedan en None.
    monkeypatch.setattr(sv, "run_optimization_engine", _engine(100.0, lambda seed: 100.0 - seed))
    db = MagicMock()

    payload = sv.run_statistical_validations(db, scenario_ids=("normal",), n_runs=4)

    row = payload["validations"][0]
    assert row["wilcoxon"]["pValue"] is None
    assert row["pValueHolm"] is None
    assert row["isSignificantHolm"] is False
