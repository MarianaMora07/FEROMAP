"""Superficie β×ρ del RSM para el mapa de calor de C5 (función pura, 0 CPU)."""

from __future__ import annotations

from app.services.calibration_method_service import beta_rho_surface, rsm_design

FACTORS = ("acoBeta", "acoRho", "acoIterations")
# Niveles no equidistantes, como los de `rsm_levels` (paso geométrico ×2).
LEVELS = {
    "acoBeta": (5.0, 10.0, 20.0),
    "acoRho": (0.06, 0.12, 0.24),
    "acoIterations": (10, 20, 40),
}
SEEDS = (42, 101, 202, 303)
_CODED_INDEX = {-1: 0, 0: 1, 1: 2}


def _synthetic_payload() -> dict:
    """Box-Behnken sintético con un mínimo interior conocido (β = 15, ρ = 0.12)."""
    runs: list[dict] = []
    for coded in rsm_design():
        natural = {
            factor: LEVELS[factor][_CODED_INDEX[level]] for factor, level in zip(FACTORS, coded)
        }
        beta, rho, iterations = natural["acoBeta"], natural["acoRho"], natural["acoIterations"]
        response = (
            200
            - 6.0 * (beta - 10)
            + 0.6 * (beta - 10) ** 2
            + 40.0 * (rho - 0.12) ** 2
            + 0.05 * abs(iterations - 20)
        )
        for seed in SEEDS:
            runs.append(
                {
                    **natural,
                    "seed": seed,
                    "uncoveredPoints": 0,
                    "distanceKmOptimized": round(response + (seed % 4) * 0.1, 3),
                }
            )
    return {"runs": runs, "scenarioId": "normal"}


def test_surface_needs_a_complete_box_behnken():
    payload = {
        "runs": [
            {
                "acoBeta": 10.0,
                "acoRho": 0.12,
                "acoIterations": 20,
                "seed": 1,
                "distanceKmOptimized": 190.0,
            }
        ]
    }
    assert beta_rho_surface(payload, delta_km=5.07) is None


def test_surface_marks_the_equivalence_threshold():
    surface = beta_rho_surface(_synthetic_payload(), delta_km=5.07)

    assert surface is not None
    flat = [value for row in surface["values"] for value in row]
    assert surface["bestKm"] == min(flat)
    assert surface["thresholdKm"] == surface["bestKm"] + 5.07
    assert min(flat) < surface["thresholdKm"] < max(flat)
    assert surface["betaRange"] == [5.0, 20.0]
    assert surface["rhoRange"] == [0.06, 0.24]
    assert surface["iterationsCenter"] == 20.0
    assert len(surface["samples"]) == 9  # celdas (β, ρ) distintas del Box-Behnken


def test_surface_optimum_is_interior_under_piecewise_coding():
    # El mínimo sintético está en β = 15 (entre el centro 10 y el alto 20). Con una codificación
    # lineal sobre la mitad del rango, el óptimo caería en otro valor.
    surface = beta_rho_surface(_synthetic_payload(), delta_km=5.07)
    assert surface is not None
    axis_beta = surface["axisBeta"]
    values = surface["values"]
    best_column = min(range(len(axis_beta)), key=lambda index: min(row[index] for row in values))

    assert abs(axis_beta[best_column] - 15.0) < 0.5
