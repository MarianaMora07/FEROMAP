"""Figuras del reporte de calibración (F1–F4) como PNG.

La preparación de datos es **pura** (se prueba con payloads sintéticos) y el renderizado se
comprueba de verdad: las figuras se escriben con el backend ``Agg`` y el test verifica que el
fichero existe y no está vacío. Sin motor, sin BD y sin pantalla.
"""

from __future__ import annotations

from pathlib import Path

from app.services import calibration_figures_service as figures
from app.services import calibration_method_service as svc

SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]


def _convergence(final: float, plateau_at: int = 5) -> list[dict[str, float | int]]:
    step = max(1.0, final * 0.02)
    return [
        {
            "iteration": iteration,
            "bestDistanceKm": (
                final if iteration >= plateau_at else final + (plateau_at - iteration) * step
            ),
        }
        for iteration in range(1, 21)
    ]


def _factorial_payload() -> dict[str, object]:
    """Factorial sintético completo (esquinas + centros) con una serie de convergencia real."""
    runs: list[dict[str, object]] = []
    for case in svc.factorial_cases():
        beta_level = 1.0 if float(case["acoBeta"]) > 3.0 else (
            -1.0 if float(case["acoBeta"]) < 3.0 else 0.0
        )
        for seed in SEEDS:
            distance = 200.0 - 3.0 * beta_level + 0.1 * seed
            runs.append(
                {
                    "label": case["label"],
                    "seed": seed,
                    "distanceKmOptimized": distance,
                    "uncoveredPoints": 0,
                    "acoAlpha": case["acoAlpha"],
                    "acoBeta": case["acoBeta"],
                    "acoRho": case["acoRho"],
                    "acoPatience": case["acoPatience"],
                    "acoConvergence": _convergence(distance),
                }
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "factorial",
        "runs": runs,
    }


def test_convergence_series_builds_one_panel_per_factor():
    data = figures.convergence_series(_factorial_payload())

    assert data["available"] is True
    assert data["iterations"] == 20
    for factor, _low, _high, _center in svc.FACTORS:
        panel = data["panels"][factor]
        assert set(panel["levels"]) == {"-1", "1"}
        assert len(panel["levels"]["-1"]["median"]) == 20
        assert len(panel["levels"]["-1"]["q3"]) == 20


def test_convergence_series_is_unavailable_without_series():
    data = figures.convergence_series({"runs": [{"seed": 1, "distanceKmOptimized": 1.0}]})

    assert data["available"] is False


def test_main_effect_series_puts_a_median_and_ci_on_each_corner():
    data = figures.main_effect_series(_factorial_payload())

    assert data["available"] is True
    levels = data["factors"]["acoBeta"]["levels"]
    corners = [row for row in levels if row["medianKm"] is not None]
    assert [row["level"] for row in corners] == [-1, 1]
    assert all(row["ci"] is not None and row["n"] == len(SEEDS) for row in corners)
    # β alto es la esquina buena del payload sintético (menos distancia).
    assert corners[1]["medianKm"] < corners[0]["medianKm"]


def test_interaction_series_splits_one_factor_by_the_other():
    data = figures.interaction_series(_factorial_payload(), "acoBeta", "acoRho")

    assert data["available"] is True
    assert data["left"]["symbol"] == "β"
    assert {series["rightLevel"] for series in data["series"]} == {-1, 1}


def test_corner_cells_requests_a_complete_design():
    cells = figures.corner_cells(_factorial_payload())

    # 2⁴ esquinas (los centros quedan fuera: no son niveles del diseño).
    assert len(cells) == 16
    assert all(len(cell) == len(SEEDS) for cell in cells.values())


def test_render_figures_writes_the_three_factorial_pngs(tmp_path):
    produced = figures.render_figures(_factorial_payload(), tmp_path)

    assert set(produced) == {"f1", "f2", "f3"}
    for name in produced.values():
        path = tmp_path / name
        assert path.exists()
        assert path.stat().st_size > 0
    # F4 requiere la evidencia replicada de C7: sin ella, no se inventa.
    assert not (tmp_path / figures.FIGURE_NAMES["f4"]).exists()


def test_render_pareto_needs_points():
    assert figures.render_pareto({}, Path("x.png")) is None


def test_render_pareto_writes_the_frontier(tmp_path):
    analysis = svc.analyze_objective(_objective_payload())

    path = figures.render_pareto(analysis, tmp_path / "f4.png")

    assert path is not None and path.exists() and path.stat().st_size > 0


def test_figures_markdown_links_the_files_relatively_and_declares_what_is_missing():
    lines = figures.figures_markdown({"f1": figures.FIGURE_NAMES["f1"]})
    text = "\n".join(lines)

    assert "![f1](f1-convergencia.png)" in text
    assert "F4 no se genera" in text


def _objective_payload() -> dict[str, object]:
    """Réplica sintética de C7 con tres filas del bloque de 8 h."""
    runs: list[dict[str, object]] = []
    for seed in SEEDS:
        for label, hours, weight in (
            ("base 8 h (w=0)", 7.96, 0.0),
            ("makespan 2", 7.91, 2.0),
            ("makespan 5", 7.87, 5.0),
        ):
            runs.append(
                {
                    "label": f"C7 · {label} · semilla {seed}",
                    "seed": seed,
                    "durationHours": 8,
                    "workloadBalanceWeightRequested": 0.0,
                    "makespanWeightRequested": weight,
                    "minActiveVehiclesRequested": None,
                    "distanceKmOptimized": 165.0 + 0.1 * seed + 3.0 * weight,
                    "distanceKmBaseline": 500.0,
                    "maxRouteHours": hours,
                    "activeVehicles": 8,
                    "uncoveredPoints": 0,
                    "acoIterationsRun": 20,
                }
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "objective",
        "maxRouteHoursTarget": 8.0,
        "runs": runs,
    }
