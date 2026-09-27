"""Tests de auto_dispatch en jobs de optimización."""

from app.services.optimization_job_service import create_optimization_job


def test_simulation_job_defaults_auto_dispatch_false():
    job = create_optimization_job(scenario_id="normal", planning_level="simulation")
    assert job.auto_dispatch is False


def test_operational_job_defaults_auto_dispatch_true():
    job = create_optimization_job(scenario_id="broken_vehicle", planning_level="operational")
    assert job.auto_dispatch is True


def test_administrative_job_respects_explicit_false():
    job = create_optimization_job(
        scenario_id="normal",
        planning_level="administrative",
        auto_dispatch=False,
    )
    assert job.auto_dispatch is False
