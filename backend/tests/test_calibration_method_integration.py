"""Camino A (leer la evidencia) y Camino B (lanzar una fase) del protocolo.

Cubre el ensamblaje de la evidencia para la API y el runner que convierte una **fase** del
protocolo en un job. Sin motor ni BD reales: se parchean el runner del barrido y el lector de
payloads, que es lo que hace comprobable el contrato sin gastar CPU.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import calibration_method_runner as runner
from app.services.calibration_evidence_service import assemble_evidence, richest_entry
from app.services.optimization_job_service import create_calibration_job
from app.services.sweep_progress import CALIBRATION_SWEEPS, SWEEP_METHOD


# --------------------------------------------------------------------------- #
# Camino A · evidencia desde la BD
# --------------------------------------------------------------------------- #


def _entry(payload: dict, *, run_id: int = 1) -> tuple[int, dict]:
    return (run_id, payload)


def _factorial_payload(runs: list[dict] | None = None) -> dict:
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "factorial",
        "seeds": [42, 101],
        "budget": {"cases": 1, "replicates": 2, "runs": 2, "workUnits": {"min": 240, "max": 240}},
        "standardHyperparameters": {"acoAlpha": 1.0, "acoBeta": 3.0, "acoRho": 0.12, "pheromoneQ": 1.0},
        "standardProfile": {"acoAnts": 12, "acoIterations": 20},
        "runs": runs or [],
    }


def _objective_payload() -> dict:
    """Réplica sintética de C7: referencia (w = 0) y una candidata, 2 semillas."""
    runs: list[dict] = []
    for seed in (42, 101):
        for label, weight in (("base 8 h (w=0)", 0.0), ("makespan 0.5", 0.5)):
            runs.append(
                {
                    "label": f"C7 · {label} · semilla {seed}",
                    "seed": seed,
                    "durationHours": 8,
                    "workloadBalanceWeightRequested": 0.0,
                    "makespanWeightRequested": weight,
                    "minActiveVehiclesRequested": None,
                    "distanceKmOptimized": 164.0 + 0.5 * seed,
                    "distanceKmBaseline": 387.1,
                    "maxRouteHours": 7.94,
                    "activeVehicles": 8,
                    # Sin cubrir a propósito: AC-2 no puede sostenerse con este bloque.
                    "uncoveredPoints": 8,
                    "acoIterationsRun": 20,
                }
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "objective",
        "seeds": [42, 101],
        "maxRouteHoursTarget": 8.0,
        "runs": runs,
    }


def test_assemble_evidence_declares_missing_phases_and_recommends_a_profile():
    entries = {"factorial": _entry(_factorial_payload(), run_id=4)}

    evidence = assemble_evidence(entries)

    assert evidence["protocol"]["referenceRunId"] == 4
    assert evidence["phases"]["factorial"]["seeds"] == 2
    assert evidence["phases"]["rsm"]["runId"] is None
    assert evidence["phases"]["rsm"]["seeds"] == 0
    assert evidence["phases"]["objective"]["runId"] is None
    assert evidence["stalePhases"] == []
    assert evidence["analyses"]["rsm"] is None
    assert evidence["analyses"]["objective"] is None
    assert evidence["recommendation"]["available"] is False  # sin esquinas no hay efectos


def test_assemble_evidence_includes_the_objective_criteria_on_the_declared_delta():
    entries = {
        "factorial": _entry(_factorial_payload(), run_id=4),
        "objective": _entry(_objective_payload(), run_id=20),
    }

    evidence = assemble_evidence(entries, delta_km=5.07)

    analysis = evidence["analyses"]["objective"]
    assert analysis["comparable"] is True
    assert analysis["deltaKm"] == 5.07
    assert analysis["ac2"]["ok"] is False  # el bloque de 8 h deja puntos sin cubrir
    assert evidence["phases"]["objective"]["runId"] == 20


def test_build_evidence_flags_the_phases_measured_on_another_instance(monkeypatch):
    from app.services import calibration_evidence_service as evidence

    monkeypatch.setattr(
        evidence,
        "payloads_of_phase",
        lambda db, *, sweep, phase, limit=100: (
            [(4, {**_factorial_payload(), "instanceFingerprint": "huella-vieja"})]
            if phase == "factorial"
            else []
        ),
    )
    monkeypatch.setattr(evidence, "current_fingerprint", lambda db, *, scenario_id: "huella-nueva")

    bundle = evidence.build_evidence(MagicMock())

    assert bundle["phases"]["factorial"]["cacheState"] == "stale"
    assert bundle["phases"]["factorial"]["stale"] is True
    assert bundle["stalePhases"] == ["factorial"]
    # Las fases sin evidencia no se declaran obsoletas, solo sin sello.
    assert bundle["phases"]["rsm"]["cacheState"] == "unknown"
    assert bundle["phases"]["rsm"]["stale"] is False


def test_assemble_evidence_requires_the_reference_factorial():
    with pytest.raises(ValueError):
        assemble_evidence({"factorial": None})


def test_richest_entry_prefers_the_run_with_more_seeds(monkeypatch):
    from app.services import calibration_evidence_service as evidence

    older_citable = {"seeds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
    newer_plumbing = {"seeds": [42, 101]}
    monkeypatch.setattr(
        evidence,
        "payloads_of_phase",
        lambda db, *, sweep, phase, limit=100: [
            (13, newer_plumbing),
            (7, older_citable),
        ],
    )

    chosen = richest_entry(MagicMock(), phase="factorial")

    assert chosen is not None
    assert chosen[0] == 7


# --------------------------------------------------------------------------- #
# Camino B · lanzar una fase
# --------------------------------------------------------------------------- #


def test_method_phase_runs_scales_with_the_seed_count():
    assert runner.method_phase_runs("factorial") == 200
    assert runner.method_phase_runs("factorial", seeds=2) == 40
    assert runner.method_phase_runs("validate", seeds=2) == 4
    assert runner.method_phase_runs("desconocida") == 0


def test_the_whole_protocol_costs_the_sum_of_its_phases():
    assert runner.is_known_phase("all") is True
    assert runner.is_known_phase("inventada") is False
    assert runner.method_phase_runs("all") == 540
    # Con 2 semillas cada fase corre 2× sus casos: 54 casos × 2 = 108 corridas.
    assert runner.method_phase_runs("all", seeds=2) == 108


def test_protocol_job_runs_all_phases_in_order_and_returns_the_evidence(monkeypatch):
    from app.services import calibration_evidence_service as evidence

    executed: list[str] = []
    progress: list[tuple[int, int, str]] = []
    monkeypatch.setattr(runner, "method_cases", lambda db, phase: [{"label": phase}])

    def fake_execute(db, *, phase, on_run=None, **_kwargs):
        executed.append(phase)
        if on_run is not None:
            on_run(0, 1, phase)
        return {"phase": phase}

    monkeypatch.setattr(runner, "_execute_phase", fake_execute)
    monkeypatch.setattr(evidence, "build_evidence", lambda db, **kwargs: {"protocol": {}, "phases": {}})

    result = runner.run_calibration_protocol(
        MagicMock(), seeds=[42, 101], on_run=lambda i, t, label: progress.append((i, t, label))
    )

    assert executed == list(runner.PROTOCOL_EXECUTION_ORDER)
    assert result == {"protocol": {}, "phases": {}}
    # El contador es global al protocolo (8 fases × 1 caso × 2 semillas) y el rótulo lleva la fase.
    assert progress[-1][1] == 16
    assert progress[-1][0] == 14
    assert progress[0][2] == "noise · noise"
    assert progress[-1][2] == "rsm · rsm"


def test_protocol_job_can_be_cancelled_between_phases(monkeypatch):
    from app.services.sweep_progress import SweepCancelled

    monkeypatch.setattr(runner, "method_cases", lambda db, phase: [{"label": phase}])

    with pytest.raises(SweepCancelled):
        runner.run_calibration_protocol(MagicMock(), cancel_check=lambda: True)


@pytest.mark.parametrize(
    ("phase", "expected"),
    [
        ("noise", 1),
        ("factorial", 20),
        ("budget", 5),
        ("identify", 6),
    ],
)
def test_method_cases_build_the_declared_design(phase, expected, monkeypatch):
    cases = runner.method_cases(MagicMock(), phase)

    assert len(cases) == expected


def test_method_cases_for_dependent_phases_use_the_stored_evidence(monkeypatch):
    monkeypatch.setattr(runner, "richest_entry", lambda db, **kwargs: (4, _factorial_payload()))
    monkeypatch.setattr(runner, "best_config_from_factorial", lambda analysis: {"acoBeta": 5.0})
    monkeypatch.setattr(
        runner,
        "recommended_profile_for_method",
        lambda db: {"profile": {**runner_standard_profile()}, "available": True},
    )

    nocut = runner.method_cases(MagicMock(), "nocut")
    validate = runner.method_cases(MagicMock(), "validate")
    rsm = runner.method_cases(MagicMock(), "rsm")

    assert len(nocut) == 2 and all(case["acoPatience"] == 0 for case in nocut)
    assert len(validate) == 2
    assert len(rsm) == 15


def test_method_cases_for_objective_replicate_the_stored_weight_sweep(monkeypatch):
    monkeypatch.setattr(runner, "load_multiobjective_sweep", lambda db: _objective_source())

    cases = runner.method_cases(MagicMock(), "objective")

    # Referencia + un representante por punto no dominado (el bloque del barrido tiene 3).
    assert len(cases) == 3
    assert all(case["axis"] == "objective" for case in cases)
    assert all((case["acoAnts"], case["acoIterations"]) == (12, 20) for case in cases)
    assert all(case["durationHours"] == 8 for case in cases)
    # La referencia (w = 0) entra siempre, aunque el barrido no la declarase candidata.
    assert any(
        case["workloadBalanceWeight"] == 0
        and case["makespanWeight"] == 0
        and case["minActiveVehicles"] is None
        for case in cases
    )


def test_method_cases_for_objective_fail_without_the_weight_sweep(monkeypatch):
    monkeypatch.setattr(runner, "load_multiobjective_sweep", lambda db: None)

    with pytest.raises(runner.MethodPhaseError, match="barrido de pesos"):
        runner.method_cases(MagicMock(), "objective")


def _objective_source() -> dict:
    """Barrido de pesos sintético: la referencia, un punto con menos makespan y otro peor."""
    def run(label, *, distance, hours, vehicles, weight_balance=0.0, weight_makespan=0.0, min_active=None, uncovered=8):
        return {
            "label": label,
            "durationHours": 8,
            "workloadBalanceWeight": weight_balance,
            "makespanWeight": weight_makespan,
            "minActiveVehiclesRequested": min_active,
            "distanceKmOptimized": distance,
            "maxRouteHours": hours,
            "activeVehicles": vehicles,
            "uncoveredPoints": uncovered,
        }

    return {
        "durationHours": 8,
        "maxRouteHoursTarget": 8.0,
        "runs": [
            run("base 8 h (w=0)", distance=165.7, hours=7.96, vehicles=8),
            run("equidad 2", distance=165.7, hours=7.96, vehicles=8, weight_balance=2.0),
            run("makespan 2", distance=166.0, hours=7.91, vehicles=8, weight_makespan=2.0),
            run("makespan 5", distance=174.6, hours=7.87, vehicles=8, weight_makespan=5.0),
        ],
    }


def runner_standard_profile() -> dict:
    from app.services.calibration_method_service import STANDARD_PROFILE

    return dict(STANDARD_PROFILE)


def test_method_cases_fail_clearly_without_the_reference_evidence(monkeypatch):
    monkeypatch.setattr(runner, "richest_entry", lambda db, **kwargs: None)

    with pytest.raises(runner.MethodPhaseError):
        runner.method_cases(MagicMock(), "nocut")


def test_method_cases_reject_an_unknown_phase():
    with pytest.raises(runner.MethodPhaseError):
        runner.method_cases(MagicMock(), "inventada")


def test_method_phase_runner_uses_the_protocol_sweep_and_the_resume_path(monkeypatch):
    captured: dict = {}

    def fake_run(db, **kwargs):
        captured.update(kwargs)
        return {"runs": []}

    monkeypatch.setattr(runner, "run_aco_sensitivity", fake_run)
    monkeypatch.setattr(
        runner,
        "recommended_profile_for_method",
        lambda db: {"profile": {**runner_standard_profile()}, "available": True},
    )

    payload = runner.run_calibration_method_phase(MagicMock(), phase="validate", seeds=[42, 101])

    assert payload == {"runs": []}
    assert captured["sweep"] == SWEEP_METHOD
    assert captured["phase"] == "validate"
    assert captured["seeds"] == [42, 101]
    assert captured["resume"] is True
    assert captured["resume_path"].name == "method-validate.jsonl"


# --------------------------------------------------------------------------- #
# Job de una fase
# --------------------------------------------------------------------------- #


def test_method_is_a_calibration_sweep():
    assert SWEEP_METHOD in CALIBRATION_SWEEPS


def test_create_calibration_job_requires_a_phase_for_the_method_sweep():
    with pytest.raises(ValueError, match="fase"):
        create_calibration_job(SWEEP_METHOD, db=MagicMock())


def test_create_calibration_job_rejects_an_unknown_phase():
    with pytest.raises(ValueError, match="Fase desconocida"):
        create_calibration_job(SWEEP_METHOD, db=MagicMock(), phase="inventada")


def test_create_calibration_job_rejects_a_phase_for_other_sweeps():
    with pytest.raises(ValueError, match="solo valen"):
        create_calibration_job("sensitivity", db=MagicMock(), phase="factorial")
