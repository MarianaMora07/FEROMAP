"""Análisis del protocolo de calibración metodológica (C1 y C3).

Cubre el diseño factorial, la derivación de δ y n desde el ruido base, los contrastes
ortogonales y los ayudantes estadísticos reutilizables. Todo se prueba sobre **payloads
sintéticos**: sin motor, sin BD y sin gastar CPU, que es justo lo que permite reanalizar la
evidencia guardada meses después.
"""

from __future__ import annotations

import pytest

from app.services import calibration_method_service as svc
from app.services.statistical_validation import (
    cliffs_delta,
    holm_adjust,
    paired_wilcoxon,
    required_n,
)

SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
BASELINE_KM = 500.0


def _convergence(final: float, plateau_at: int) -> list[dict[str, float | int]]:
    """Serie monótona que alcanza su valor final en ``plateau_at``.

    El escalón por onda es el 2 % del valor final, deliberadamente por encima de la tolerancia
    del 1 % con la que el análisis decide "cuándo llegó": así el límite no es ambiguo.
    """
    step = max(1.0, final * 0.02)
    return [
        {
            "iteration": iteration,
            "bestDistanceKm": (
                final if iteration >= plateau_at else final + (plateau_at - iteration) * step
            ),
            "iterationBestDistanceKm": final,
            "bestCost": 1.0,
        }
        for iteration in range(1, 21)
    ]


def _run(
    *,
    seed: int,
    distance: float,
    label: str,
    plateau_at: int = 7,
    uncovered: int = 0,
    error: str | None = None,
    **params: object,
) -> dict[str, object]:
    run: dict[str, object] = {
        "label": label,
        "seed": seed,
        "distanceKmOptimized": distance,
        "distanceKmBaseline": BASELINE_KM,
        "uncoveredPoints": uncovered,
        "acoIterationsRun": 20,
        "acoStoppedEarly": False,
        "acoConvergence": _convergence(distance, plateau_at),
        **params,
    }
    if error is not None:
        run["error"] = error
    return run


def _noise_payload() -> dict[str, object]:
    return {
        "generatedAt": "2026-09-17T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "noise",
        "runs": [
            _run(seed=seed, distance=190.0 + seed, label="perfil estándar") for seed in SEEDS
        ],
    }


def _level_of(case: dict[str, object], key: str) -> int:
    """Nivel codificado (−1/0/+1) del caso, calculado **desde el diseño** y no desde el módulo."""
    _key, low, high, center = next(factor for factor in svc.FACTORS if factor[0] == key)
    value = case[key]
    if value == center:
        return 0
    if value == low:
        return -1
    if value == high:
        return 1
    raise AssertionError(f"Valor fuera del diseño en {key}: {value}")


def _factorial_payload(*, beta_effect: float = 3.0, seed_slope: float = 1.0) -> dict[str, object]:
    """Payload sintético con un efecto conocido **solo** en β.

    ``y = 200 + beta_effect·x_β + seed_slope·seed·x_β``. Como los contrastes de un factorial
    completo son ortogonales, el efecto medido de β debe ser ``2·(beta_effect + seed_slope·seed)``
    y el de todo lo demás exactamente cero.
    """
    runs: list[dict[str, object]] = []
    for case in svc.factorial_cases():
        beta = float(_level_of(case, "acoBeta"))
        for seed in SEEDS:
            distance = 200.0 + beta_effect * beta + seed_slope * seed * beta
            runs.append(
                _run(
                    seed=seed,
                    distance=distance,
                    label=str(case["label"]),
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    acoPatience=case["acoPatience"],
                )
            )
    return {
        "generatedAt": "2026-09-17T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "factorial",
        "runs": runs,
    }


# --------------------------------------------------------------------------- #
# Diseño
# --------------------------------------------------------------------------- #


def test_factorial_cases_are_a_complete_factorial_with_centers():
    cases = svc.factorial_cases()
    corners = [case for case in cases if case["axis"] == "factorial"]
    centers = [case for case in cases if case["axis"] == "center"]

    assert len(corners) == 16
    assert len(centers) == svc.CENTER_REPLICATES
    # Cada combinación de esquinas aparece exactamente una vez y con el perfil fijo.
    combinations = {tuple(case[key] for key, *_rest in svc.FACTORS) for case in corners}
    assert len(combinations) == 16
    for case in corners:
        for key, low, high, _center in svc.FACTORS:
            assert case[key] in (low, high)
        assert (case["acoAnts"], case["acoIterations"]) == (12, 20)
    for case in centers:
        for key, _low, _high, center in svc.FACTORS:
            assert case[key] == center
    assert len({case["label"] for case in cases}) == len(cases)


def test_factorial_design_declares_no_aliasing():
    design = svc.factorial_design()
    assert design["runs"] == 20
    assert "ninguno" in design["aliasing"]
    assert set(design["factors"]) == {key for key, *_rest in svc.FACTORS}


# --------------------------------------------------------------------------- #
# C1 · Ruido base
# --------------------------------------------------------------------------- #


def test_analyze_noise_derives_stats_and_thresholds():
    analysis = svc.analyze_noise(_noise_payload())

    assert analysis["runsValid"] == 10
    assert analysis["stats"]["median"] == 195.5  # mediana de 191..200
    assert analysis["stats"]["sd"] == 3.03
    assert analysis["deltaKm"] == 5.0  # 1 % de la referencia voraz (500 km)
    assert analysis["deltaSource"].startswith("1 %")
    # El umbral heredado (0.5 % del mejor) queda por debajo del ruido medido.
    legacy = analysis["legacyThreshold"]
    assert legacy["km"] == 0.96
    assert legacy["sdOverThreshold"] > 3.0


def test_analyze_noise_reports_required_seeds_for_paired_and_unpaired():
    required = svc.analyze_noise(_noise_payload())["requiredSeeds"]

    assert required["pairedVsDelta"] > required["unpairedVsDelta"]
    assert required["current"] == 10


def test_analyze_noise_summarizes_convergence():
    analysis = svc.analyze_noise(_noise_payload())

    assert analysis["convergence"]["seriesAvailable"] is True
    assert analysis["convergence"]["medianIterationToFinal"] == 7
    assert analysis["iterationsRun"] == [20]
    assert analysis["stoppedEarly"] == 0


def test_analyze_noise_excludes_invalid_runs_but_keeps_them_visible():
    payload = _noise_payload()
    payload["runs"] = [
        *payload["runs"],
        _run(seed=991, distance=150.0, label="con error", error="boom"),
        _run(seed=992, distance=140.0, label="sin cubrir", uncovered=3),
    ]

    analysis = svc.analyze_noise(payload)

    assert analysis["runsTotal"] == 12
    assert analysis["runsValid"] == 10
    assert analysis["runsExcluded"] == 2
    assert 140.0 not in analysis["distances"]
    assert any("fuera del ranking" in item for item in analysis["limitations"])


def test_analyze_noise_declares_the_paired_noise_limitation():
    limitations = svc.analyze_noise(_noise_payload())["limitations"]
    assert any("pareado" in item for item in limitations)


def test_format_noise_analysis_reports_the_contrast_with_the_legacy_threshold():
    text = "\n".join(svc.format_noise_analysis(svc.analyze_noise(_noise_payload())))

    assert "Ruido base" in text
    assert "umbral heredado" in text
    assert "δ declarado" in text


# --------------------------------------------------------------------------- #
# C3 · Factorial
# --------------------------------------------------------------------------- #


def test_analyze_factorial_recovers_a_known_effect():
    analysis = svc.analyze_factorial(_factorial_payload())

    assert analysis["comparable"] is True
    assert analysis["corners"] == 16
    assert analysis["centers"] == svc.CENTER_REPLICATES
    assert len(analysis["seeds"]) == len(SEEDS)

    significant = [contrast["code"] for contrast in analysis["contrasts"] if contrast["significant"]]
    assert significant == ["acoBeta"]
    # Efecto por semilla = 2·(3 + 1·semilla) → mediana de 8, 10, …, 26 = 17.
    beta = next(c for c in analysis["contrasts"] if c["code"] == "acoBeta")
    assert beta["medianKm"] == pytest.approx(17.0, abs=0.01)

    # Los contrastes nulos no se declaran significativos ni con p-valor inventado.
    nulls = [c for c in analysis["contrasts"] if c["code"] != "acoBeta"]
    assert all(c["medianKm"] == pytest.approx(0.0, abs=0.01) for c in nulls)
    assert all(c["significant"] is False for c in nulls)


def test_analyze_factorial_has_no_curvature_when_the_surface_is_flat():
    analysis = svc.analyze_factorial(_factorial_payload())
    assert analysis["curvature"]["medianKm"] == pytest.approx(0.0, abs=0.01)


def test_analyze_factorial_estimates_the_family_of_ten_contrasts():
    analysis = svc.analyze_factorial(_factorial_payload())
    codes = {contrast["code"] for contrast in analysis["contrasts"]}

    assert len(analysis["contrasts"]) == 10
    assert {"acoAlpha", "acoBeta", "acoRho", "acoPatience"} <= codes
    assert "acoBeta" and "acoRho" in codes


def test_analyze_factorial_reports_the_equivalent_region_and_cheapest():
    analysis = svc.analyze_factorial(_factorial_payload())
    selection = analysis["selection"]

    assert selection["available"] is True
    assert selection["equivalentCount"] >= 1
    # Los ocho vértices con β bajo empatan: la región equivalente los agrupa.
    assert selection["equivalentCount"] == 8
    assert selection["cheapestEquivalent"] is not None


def test_analyze_factorial_flags_an_incomplete_design():
    cases = svc.factorial_cases()[:10]
    payload = {
        "generatedAt": "x",
        "scenarioId": "normal",
        "phase": "factorial",
        "runs": [
            _run(
                seed=seed,
                distance=200.0,
                label=str(case["label"]),
                acoAlpha=case["acoAlpha"],
                acoBeta=case["acoBeta"],
                acoRho=case["acoRho"],
                acoPatience=case["acoPatience"],
            )
            for case in cases
            for seed in SEEDS
        ],
    }

    analysis = svc.analyze_factorial(payload)

    assert analysis["comparable"] is False
    assert "incompleto" in analysis["reason"]


def test_analyze_factorial_requires_shared_seeds():
    payload = _factorial_payload()
    # Una esquina se queda con una sola semilla: la intersección deja de ser comparable.
    first_label = payload["runs"][0]["label"]
    payload["runs"] = [
        run
        for run in payload["runs"]
        if not (run["label"] == first_label and run["seed"] != SEEDS[0])
    ]

    analysis = svc.analyze_factorial(payload)

    assert analysis["comparable"] is False
    assert "semillas" in analysis["reason"]


def test_format_factorial_analysis_renders_the_tables():
    text = "\n".join(svc.format_factorial_analysis(svc.analyze_factorial(_factorial_payload())))

    assert "Factorial 2⁴" in text
    assert "Efectos" in text
    assert "Selección" in text


def test_analyze_factorial_labels_configurations_not_runs():
    payload = _factorial_payload()
    # El runner informa corridas y añade la semilla a su rótulo de progreso.
    for run in payload["runs"]:
        run["label"] = f"{run['label']} · semilla {run['seed']}"

    configs = svc.analyze_factorial(payload)["configs"]

    assert all("semilla" not in row["label"] for row in configs)
    assert any(row["label"].startswith("centro ") for row in configs)


def test_analyze_factorial_reports_effective_iterations_per_config():
    payload = _factorial_payload()
    # La paciencia recorta distinto: misma distancia, coste muy distinto.
    for run in payload["runs"]:
        run["acoIterationsRun"] = 20 if run["acoPatience"] == 10 else 4

    configs = svc.analyze_factorial(payload)["configs"]

    assert {row["iterations"]["median"] for row in configs} == {4.0, 20.0}
    assert all(row["iterations"]["min"] is not None for row in configs)


def test_analyze_factorial_does_not_claim_a_verdict_without_sample():
    text = "\n".join(svc.format_factorial_analysis(svc.analyze_factorial(_factorial_payload())))

    # Los contrastes nulos no tienen pares no nulos: no se declaran «no significativos».
    assert "sin muestra" in text


def test_analyze_factorial_verifies_replicate_determinism():
    analysis = svc.analyze_factorial(_factorial_payload())

    # Las 4 réplicas del centro son la misma corrida repetida con las mismas semillas.
    assert analysis["noise"]["centerReplicatesIdentical"] is True
    assert analysis["noise"]["centerSdAcrossSeeds"] is not None


def test_analyze_factorial_detects_non_deterministic_centers():
    payload = _factorial_payload()
    # Solo la última réplica del centro se desvía: el motor dejaría de ser determinista.
    payload["runs"][-1]["distanceKmOptimized"] = 999.0

    analysis = svc.analyze_factorial(payload)

    assert analysis["noise"]["centerReplicatesIdentical"] is False
    assert any("determinismo" in item for item in analysis["limitations"])


def test_heartbeat_prints_progress_and_remaining_time(capsys):
    from scripts.calibration_method import _heartbeat

    report = _heartbeat(4)
    report(
        {
            "label": "α0.5 β1 ρ0.05 P2 · semilla 42",
            "distanceKmOptimized": 187.0,
            "acoIterationsRun": 5,
            "acoSeconds": 2.1,
        }
    )
    report({"label": "roto", "error": "boom"})

    output = capsys.readouterr().out
    assert "[  1/4]" in output
    assert "187.0 km" in output and "5 iter" in output
    assert "restante" in output
    assert "[  2/4]" in output and "✗ boom" in output


# --------------------------------------------------------------------------- #
# C3.2 · Eje de presupuesto
# --------------------------------------------------------------------------- #


def _budget_payload(
    distances: dict[tuple[int, int], float],
    *,
    seeds: list[int] | None = None,
    effective_iterations: dict[tuple[int, int], int] | None = None,
    points: list[tuple[int, int]] | None = None,
) -> dict[str, object]:
    """Payload sintético del eje de presupuesto con una distancia conocida por punto."""
    seed_list = seeds if seeds is not None else SEEDS
    runs: list[dict[str, object]] = []
    for case in svc.budget_cases(patience=0):
        point = (int(case["acoAnts"]), int(case["acoIterations"]))
        if points is not None and point not in points:
            continue
        iterations_run = (effective_iterations or {}).get(point, point[1])
        for seed in seed_list:
            runs.append(
                _run(
                    seed=seed,
                    distance=distances[point],
                    label=str(case["label"]),
                    acoAnts=point[0],
                    acoIterations=point[1],
                    acoPatience=case["acoPatience"],
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    pheromoneQ=case["pheromoneQ"],
                    acoIterationsRun=iterations_run,
                    acoSeconds=round(0.1 * point[1], 2),
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "budget",
        "runs": runs,
    }


def test_budget_cases_cover_fixed_work_and_the_growing_arm():
    cases = svc.budget_cases(patience=0)
    points = {(case["acoAnts"], case["acoIterations"]) for case in cases}

    assert points == {(8, 30), (12, 20), (20, 12), (12, 40), (20, 40)}
    fixed = [case for case in cases if case["acoAnts"] * case["acoIterations"] == 240]
    assert len(fixed) == 3
    # El resto del perfil queda en el estándar y la paciencia se fija explícitamente.
    for case in cases:
        assert (case["acoAlpha"], case["acoBeta"], case["acoRho"], case["pheromoneQ"]) == (
            1.0,
            3.0,
            0.12,
            1.0,
        )
        assert case["acoPatience"] == 0


def test_analyze_budget_finds_the_equivalent_region_and_the_cheapest_point():
    equal = 195.0
    analysis = svc.analyze_budget(
        _budget_payload({point: equal for point in svc.BUDGET_POINTS})
    )

    assert analysis["comparable"] is True
    assert len(analysis["points"]) == 5
    assert analysis["fixedWork"]["equivalentCount"] == 3
    # Empate exacto: decide el coste declarado (menos hormigas, después menos iteraciones).
    cheapest = analysis["fixedWork"]["cheapestEquivalent"]
    assert (cheapest["ants"], cheapest["iterations"]) == (8, 30)
    # Sin mejora, el techo se queda en 20.
    assert analysis["decision"]["iterationsCeiling"] == 20
    assert all(not row["improvesBeyondDelta"] for row in analysis["growingArm"])


def test_analyze_budget_raises_the_ceiling_only_when_40_improves_more_than_delta():
    distances = {point: 195.0 for point in svc.BUDGET_POINTS}
    distances[(12, 40)] = 185.0  # mejora 10 km > δ = 5 km
    distances[(20, 40)] = 195.0
    analysis = svc.analyze_budget(_budget_payload(distances))

    assert analysis["decision"]["iterationsCeiling"] == 40
    assert analysis["decision"]["raised"] is True
    improved = [row for row in analysis["growingArm"] if row["improvesBeyondDelta"]]
    assert len(improved) == 1
    assert improved[0]["low"] == [12, 20] and improved[0]["high"] == [12, 40]
    assert improved[0]["verdict"] == "sube"


def test_analyze_budget_keeps_the_ceiling_when_40_only_matches_within_delta():
    distances = {point: 195.0 for point in svc.BUDGET_POINTS}
    distances[(12, 40)] = 191.0  # mejora 4 km < δ: equivalente, no material
    analysis = svc.analyze_budget(_budget_payload(distances))

    assert analysis["decision"]["iterationsCeiling"] == 20
    arm = next(row for row in analysis["growingArm"] if row["low"] == [12, 20])
    assert arm["withinDelta"] is True
    assert arm["verdict"] == "se queda"


def test_analyze_budget_reports_effective_iterations_per_point():
    distances = {point: 195.0 for point in svc.BUDGET_POINTS}
    # El recorte por paciencia deja iteraciones efectivas distintas de las configuradas.
    effective = {(8, 30): 30, (12, 20): 9, (20, 12): 6, (12, 40): 40, (20, 40): 40}
    analysis = svc.analyze_budget(
        _budget_payload(distances, effective_iterations=effective)
    )

    by_label = {row["iterations"]: row["iterationsEffective"]["median"] for row in analysis["points"]}
    assert by_label[20] == 9.0
    assert by_label[40] == 40.0


def test_analyze_budget_refuses_an_incomplete_axis():
    distances = {point: 195.0 for point in svc.BUDGET_POINTS}
    payload = _budget_payload(distances, points=[(8, 30), (12, 20), (20, 12)])

    analysis = svc.analyze_budget(payload)

    assert analysis["comparable"] is False
    assert "(12, 40)" in analysis["reason"]


def test_analyze_budget_flags_when_measured_seconds_disagree_with_declared_cost():
    distances = {point: 195.0 for point in svc.BUDGET_POINTS}
    analysis = svc.analyze_budget(_budget_payload(distances))

    # El payload sintético cobra 0.1 s por iteración: (8, 30) es el más barato por la regla
    # declarada (menos hormigas) y (20, 12) el de menos segundos medidos.
    assert analysis["fixedWork"]["cheapestEquivalent"]["ants"] == 8
    assert analysis["fixedWork"]["measuredCheapest"]["ants"] == 20
    assert analysis["warnings"]
    assert "ant-iteraciones" in analysis["warnings"][0]


def test_format_budget_analysis_renders_the_tables():
    payload = _budget_payload({point: 195.0 for point in svc.BUDGET_POINTS})
    text = "\n".join(svc.format_budget_analysis(svc.analyze_budget(payload)))

    assert "Eje de presupuesto" in text
    assert "Brazo creciente" in text
    assert "Decisión" in text
    assert "I = 20" in text


# --------------------------------------------------------------------------- #
# C3.3 · Brazo sin corte
# --------------------------------------------------------------------------- #

_BEST_C3 = {"acoAlpha": 2.0, "acoBeta": 5.0, "acoRho": 0.3}


def _reference_pair_payload(
    *, standard: float, best: float, seeds: list[int] | None = None
) -> dict[str, object]:
    """Referencia del brazo sin corte: centro estándar (P5) y mejor esquina (P10) de C3."""
    seed_list = seeds if seeds is not None else SEEDS
    runs: list[dict[str, object]] = []
    for seed in seed_list:
        runs.append(
            _run(
                seed=seed,
                distance=standard,
                label="centro",
                acoAlpha=1.0,
                acoBeta=3.0,
                acoRho=0.12,
                pheromoneQ=1.0,
                acoAnts=12,
                acoIterations=20,
                acoPatience=5,
                acoIterationsRun=9,
            )
        )
        runs.append(
            _run(
                seed=seed,
                distance=best,
                label="esquina",
                acoAlpha=2.0,
                acoBeta=5.0,
                acoRho=0.3,
                pheromoneQ=1.0,
                acoAnts=12,
                acoIterations=20,
                acoPatience=10,
                acoIterationsRun=20,
            )
        )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "factorial",
        "runs": runs,
    }


def _no_cut_payload(
    *, standard: float, best: float, seeds: list[int] | None = None
) -> dict[str, object]:
    seed_list = seeds if seeds is not None else SEEDS
    runs: list[dict[str, object]] = []
    for case in svc.no_cut_cases(_BEST_C3):
        distance = standard if str(case["label"]).startswith("perfil estándar") else best
        for seed in seed_list:
            runs.append(
                _run(
                    seed=seed,
                    distance=distance,
                    label=str(case["label"]),
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    pheromoneQ=case["pheromoneQ"],
                    acoAnts=case["acoAnts"],
                    acoIterations=case["acoIterations"],
                    acoPatience=case["acoPatience"],
                    acoIterationsRun=20,
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "nocut",
        "runs": runs,
    }


def test_no_cut_cases_use_the_standard_and_the_best_of_c3_without_cut():
    cases = svc.no_cut_cases(_BEST_C3)

    assert len(cases) == 2
    assert all(case["acoPatience"] == 0 for case in cases)
    standard, best = cases
    assert (standard["acoAlpha"], standard["acoBeta"], standard["acoRho"]) == (1.0, 3.0, 0.12)
    assert (best["acoAlpha"], best["acoBeta"], best["acoRho"]) == (2.0, 5.0, 0.3)
    assert best["pheromoneQ"] == 1.0
    assert (best["acoAnts"], best["acoIterations"]) == (12, 20)


def test_best_config_from_factorial_returns_the_best_measured_knobs():
    analysis = svc.analyze_factorial(_factorial_payload())
    config = svc.best_config_from_factorial(analysis)

    # En el payload sintético el mejor nivel de β es el bajo; el resto no tiene efecto.
    assert config is not None
    assert config["acoBeta"] == 1.0


def test_best_config_from_factorial_is_none_without_a_comparable_design():
    assert svc.best_config_from_factorial({"comparable": False}) is None


def test_analyze_no_cut_pairs_by_seed_and_configuration():
    reference = _reference_pair_payload(standard=195.0, best=190.0)
    payload = _no_cut_payload(standard=195.0, best=190.0)

    analysis = svc.analyze_no_cut(payload, reference)

    assert analysis["comparable"] is True
    assert len(analysis["comparisons"]) == 2
    for row in analysis["comparisons"]:
        assert row["n"] == len(SEEDS)
        assert row["medianKm"] == pytest.approx(0.0, abs=0.01)
        assert row["withinDelta"] is True
        assert row["verdict"] == "equivalente"
    labels = " ".join(row["label"] for row in analysis["comparisons"])
    assert "α2 β5" in labels and "α1 β3" in labels


def test_analyze_no_cut_measures_the_quality_left_on_the_table():
    reference = _reference_pair_payload(standard=200.0, best=195.0)
    # Sin corte el motor encuentra rutas 10 km mejores y gasta las 20 ondas.
    payload = _no_cut_payload(standard=190.0, best=185.0)

    analysis = svc.analyze_no_cut(payload, reference)

    rows = {row["params"]["acoRho"]: row for row in analysis["comparisons"]}
    standard = rows[0.12]
    assert standard["medianKm"] == pytest.approx(-10.0, abs=0.01)
    assert standard["improvesBeyondDelta"] is True
    assert standard["verdict"] == "el corte cuesta > δ"
    # La regla de parada ahorraba 11 ondas en el centro (9 de 20) y 0 en la esquina (P10).
    assert standard["iterationsSavedMedian"] == pytest.approx(11.0)
    assert rows[0.3]["iterationsSavedMedian"] == pytest.approx(0.0)


def test_analyze_no_cut_refuses_without_a_matching_reference():
    reference = _reference_pair_payload(standard=200.0, best=195.0)
    payload = _no_cut_payload(standard=190.0, best=185.0)
    # La referencia pierde el punto estándar: queda una sola configuración emparejada.
    reference["runs"] = [run for run in reference["runs"] if run["acoRho"] != 0.12]

    analysis = svc.analyze_no_cut(payload, reference)

    assert analysis["comparable"] is True
    assert len(analysis["comparisons"]) == 1


def test_analyze_no_cut_refuses_when_nothing_matches():
    reference = _reference_pair_payload(standard=200.0, best=195.0)
    for run in reference["runs"]:
        run["acoAnts"] = 8  # otro presupuesto: no es el mismo punto del motor
    payload = _no_cut_payload(standard=190.0, best=185.0)

    analysis = svc.analyze_no_cut(payload, reference)

    assert analysis["comparable"] is False
    assert "empareja" in analysis["reason"]


def test_format_no_cut_analysis_renders_the_table():
    analysis = svc.analyze_no_cut(
        _no_cut_payload(standard=190.0, best=185.0),
        _reference_pair_payload(standard=200.0, best=195.0),
    )
    text = "\n".join(svc.format_no_cut_analysis(analysis))

    assert "Brazo sin corte" in text
    assert "sin corte − con corte" in text or "Sin corte" in text
    assert "cuesta > δ" in text


# --------------------------------------------------------------------------- #
# C4 · Identificación de la razón r = β/α y validación de Q
# --------------------------------------------------------------------------- #


def _ratio_payload(distances: dict[tuple[float, float, float], float]) -> dict[str, object]:
    """Payload sintético de C4 con una distancia conocida por punto (α, β, Q)."""
    runs: list[dict[str, object]] = []
    for case in svc.ratio_cases():
        key = (case["acoAlpha"], case["acoBeta"], case["pheromoneQ"])
        for seed in SEEDS:
            runs.append(
                _run(
                    seed=seed,
                    distance=distances[key],
                    label=str(case["label"]),
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    pheromoneQ=case["pheromoneQ"],
                    acoPatience=case["acoPatience"],
                    acoAnts=case["acoAnts"],
                    acoIterations=case["acoIterations"],
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "identify",
        "runs": runs,
    }


def test_ratio_cases_cover_two_ratios_and_q_at_a_fixed_profile():
    cases = svc.ratio_cases()

    assert len(cases) == 6
    assert all((case["acoAnts"], case["acoIterations"]) == (12, 20) for case in cases)
    assert all(case["acoRho"] == 0.12 and case["acoPatience"] == 5 for case in cases)
    ratios = {(case["acoAlpha"], case["acoBeta"]): case["ratio"] for case in cases}
    assert ratios[(1.0, 5.0)] == 5.0 and ratios[(2.0, 10.0)] == 5.0
    assert ratios[(1.0, 2.5)] == 2.5 and ratios[(2.0, 5.0)] == 2.5
    assert {case["pheromoneQ"] for case in cases} == {0.5, 1.0, 2.0}


def test_analyze_ratio_confirms_that_the_ratio_governs_the_order():
    payload = _ratio_payload(
        {
            (1.0, 5.0, 1.0): 185.0,
            (2.0, 10.0, 1.0): 185.0,
            (1.0, 2.5, 1.0): 192.0,
            (2.0, 5.0, 1.0): 192.0,
            (1.0, 3.0, 0.5): 195.0,
            (1.0, 3.0, 2.0): 195.0,
        }
    )

    analysis = svc.analyze_ratio(payload)

    assert analysis["comparable"] is True
    assert analysis["verdict"]["ratioGoverns"] is True
    assert analysis["verdict"]["contradicted"] is False
    assert analysis["verdict"]["qInert"] is True
    assert "sí" in analysis["verdict"]["statement"]
    assert len(analysis["comparisons"]) == 4
    assert all(row["pValueHolm"] is not None or row["test"]["pValue"] is None for row in analysis["comparisons"])


def test_analyze_ratio_detects_a_contradiction_of_h5():
    payload = _ratio_payload(
        {
            (1.0, 5.0, 1.0): 185.0,
            (2.0, 10.0, 1.0): 195.0,  # misma razón, 10 km de diferencia: contradice H5
            (1.0, 2.5, 1.0): 192.0,
            (2.0, 5.0, 1.0): 192.0,
            (1.0, 3.0, 0.5): 195.0,
            (1.0, 3.0, 2.0): 195.0,
        }
    )

    analysis = svc.analyze_ratio(payload)

    assert analysis["verdict"]["ratioGoverns"] is False
    assert analysis["verdict"]["contradicted"] is True
    within = next(row for row in analysis["comparisons"] if row["code"] == "ratioWithin5")
    assert within["satisfied"] is False


def test_analyze_ratio_reports_q_as_not_inert_when_it_moves_the_distance():
    payload = _ratio_payload(
        {
            (1.0, 5.0, 1.0): 185.0,
            (2.0, 10.0, 1.0): 185.0,
            (1.0, 2.5, 1.0): 192.0,
            (2.0, 5.0, 1.0): 192.0,
            (1.0, 3.0, 0.5): 185.0,
            (1.0, 3.0, 2.0): 195.0,
        }
    )

    analysis = svc.analyze_ratio(payload)

    assert analysis["verdict"]["qInert"] is False
    q_row = next(row for row in analysis["comparisons"] if row["code"] == "q")
    assert q_row["satisfied"] is False


def test_analyze_ratio_refuses_an_incomplete_design():
    distances = {
        (1.0, 5.0, 1.0): 185.0,
        (2.0, 10.0, 1.0): 185.0,
        (1.0, 2.5, 1.0): 192.0,
        (2.0, 5.0, 1.0): 192.0,
        (1.0, 3.0, 0.5): 195.0,
        (1.0, 3.0, 2.0): 195.0,
    }
    payload = _ratio_payload(distances)
    payload["runs"] = [run for run in payload["runs"] if run["pheromoneQ"] != 0.5]

    analysis = svc.analyze_ratio(payload)

    assert analysis["comparable"] is False
    assert "Q0.5" in analysis["reason"]


def test_format_ratio_analysis_renders_the_tables():
    payload = _ratio_payload(
        {
            (1.0, 5.0, 1.0): 185.0,
            (2.0, 10.0, 1.0): 185.0,
            (1.0, 2.5, 1.0): 192.0,
            (2.0, 5.0, 1.0): 192.0,
            (1.0, 3.0, 0.5): 195.0,
            (1.0, 3.0, 2.0): 195.0,
        }
    )
    text = "\n".join(svc.format_ratio_analysis(svc.analyze_ratio(payload)))

    assert "Identificación" in text
    assert "Contrastes pre-declarados" in text
    assert "Veredicto" in text
    assert "Q inerte" in text


# --------------------------------------------------------------------------- #
# E4 · Síntesis de la recomendación
# --------------------------------------------------------------------------- #

# Medias de celda (nivel α, nivel β) que reproducen la estructura de C3: efecto principal
# grande en ambos, pero el de α vive en las celdas de β bajo (interacción material).
_COUPLED_CELLS: dict[tuple[int, int], float] = {
    (-1, -1): 268.0,
    (-1, 1): 192.0,
    (1, -1): 203.0,
    (1, 1): 190.0,
}


def _coupled_factorial_payload() -> dict[str, object]:
    runs: list[dict[str, object]] = []
    for case in svc.factorial_cases():
        alpha = _level_of(case, "acoAlpha")
        beta = _level_of(case, "acoBeta")
        for seed in SEEDS:
            if alpha == 0 or beta == 0:
                distance = 195.0 + 0.2 * seed
            else:
                distance = _COUPLED_CELLS[(alpha, beta)] + 0.4 * seed * alpha + 0.6 * seed * beta
            runs.append(
                _run(
                    seed=seed,
                    distance=distance,
                    label=str(case["label"]),
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    acoPatience=case["acoPatience"],
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "factorial",
        "runs": runs,
    }


def test_recommend_profile_moves_only_the_robust_knob_of_a_coupled_pair():
    analysis = svc.recommend_profile(svc.analyze_factorial(_coupled_factorial_payload()))

    assert analysis["available"] is True
    profile = analysis["profile"]
    assert profile["acoBeta"] == 5.0
    # α tiene efecto principal grande, pero con β = 5 es inerte: no se mueve.
    assert profile["acoAlpha"] == 1.0
    assert profile["acoRho"] == 0.12
    assert profile["acoPatience"] == 5
    assert analysis["justification"]["acoBeta"]["moved"] is True
    assert analysis["justification"]["acoAlpha"]["source"].startswith("efecto simple condicionado")
    assert any("acoplado" in warning for warning in analysis["warnings"])


def test_recommend_profile_recommends_a_ratio_when_c4_says_it_governs():
    ratio_analysis = {
        "verdict": {"ratioGoverns": True},
        "comparisons": [{"code": "q", "satisfied": True}],
        "points": [],
    }

    analysis = svc.recommend_profile(
        svc.analyze_factorial(_coupled_factorial_payload()), ratio_analysis
    )

    # La mejor esquina del payload es α0.5 β5 (r = 10): con α estándar, β = 10.
    assert analysis["justification"]["acoBeta"]["source"].startswith("razón")
    assert analysis["profile"]["acoBeta"] == pytest.approx(10.0)
    assert any("extrapolación" in warning for warning in analysis["warnings"])


def test_recommend_profile_keeps_everything_when_no_effect_is_material():
    flat = svc.analyze_factorial(_factorial_payload(beta_effect=0.0, seed_slope=0.0))

    analysis = svc.recommend_profile(flat)

    assert analysis["available"] is True
    assert analysis["profile"]["acoBeta"] == 3.0
    assert not any(entry.get("moved") for entry in analysis["justification"].values())


def test_recommend_profile_declares_the_budget_alternative_without_moving_it():
    analysis = svc.recommend_profile(svc.analyze_factorial(_coupled_factorial_payload()))
    budget = analysis["justification"]["budget"]

    assert budget["moved"] is False
    assert (analysis["profile"]["acoAnts"], analysis["profile"]["acoIterations"]) == (12, 20)
    assert budget["alternative"] == svc.BUDGET_ALTERNATIVE
    assert "paciencia" in budget["reason"]


def test_recommend_profile_warns_when_c4_is_missing():
    analysis = svc.recommend_profile(svc.analyze_factorial(_coupled_factorial_payload()))

    assert analysis["ratioGoverns"] is None
    assert analysis["profile"]["pheromoneQ"] == 1.0
    assert any("Q no se pudo validar" in warning for warning in analysis["warnings"])


def test_recommend_profile_needs_a_comparable_factorial():
    analysis = svc.recommend_profile({"comparable": False})

    assert analysis["available"] is False
    assert "comparable" in analysis["reason"]


def test_format_recommendation_renders_the_profile():
    analysis = svc.recommend_profile(
        svc.analyze_factorial(_coupled_factorial_payload())
    )
    text = "\n".join(svc.format_recommendation(analysis))

    assert "Síntesis de la recomendación" in text
    assert "Perfil por perilla" in text
    assert "presupuesto" in text
    assert "Advertencias" in text


# --------------------------------------------------------------------------- #
# C6 · Validación replicada
# --------------------------------------------------------------------------- #

_RECOMMENDED_STUB = {**svc.STANDARD_PROFILE, "acoBeta": 5.0}


def _validation_payload(
    differences: dict[int, float],
    *,
    control: float = 200.0,
    recommended: dict[str, object] | None = None,
) -> dict[str, object]:
    """Payload sintético de C6 con una diferencia pareada conocida por semilla."""
    runs: list[dict[str, object]] = []
    for case in svc.validation_cases(recommended or _RECOMMENDED_STUB):
        is_control = str(case["label"]).startswith("control")
        for seed, gap in differences.items():
            runs.append(
                _run(
                    seed=seed,
                    distance=control if is_control else control + gap,
                    label=str(case["label"]),
                    acoAlpha=case["acoAlpha"],
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    pheromoneQ=case["pheromoneQ"],
                    acoPatience=case["acoPatience"],
                    acoAnts=case["acoAnts"],
                    acoIterations=case["acoIterations"],
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "validate",
        "runs": runs,
    }


def test_validation_cases_compare_the_control_with_the_recommended_profile():
    cases = svc.validation_cases(_RECOMMENDED_STUB)

    assert len(cases) == 2
    control, candidate = cases
    assert (control["acoAlpha"], control["acoBeta"], control["acoRho"]) == (1.0, 3.0, 0.12)
    assert candidate["acoBeta"] == 5.0
    # Lo único que cambia es la perilla que E4 movió.
    assert (control["acoPatience"], candidate["acoPatience"]) == (5, 5)
    assert (control["acoAnts"], candidate["acoAnts"]) == (12, 12)
    assert str(control["label"]).startswith("control") and str(candidate["label"]).startswith(
        "recomendado"
    )


def test_analyze_validation_declares_equal_when_the_ci_is_inside_delta():
    differences = {seed: -1.0 - 0.2 * seed for seed in SEEDS}

    analysis = svc.analyze_validation(_validation_payload(differences))

    assert analysis["comparable"] is True
    assert analysis["verdict"] == "equal"
    assert analysis["delta"]["withinDelta"] is True
    assert analysis["delta"]["tost"]["equivalent"] is True
    assert analysis["delta"]["medianKm"] == pytest.approx(-2.1, abs=0.2)


def test_analyze_validation_declares_better_when_the_ci_clears_delta():
    differences = {seed: -10.0 - 0.5 * seed for seed in SEEDS}

    analysis = svc.analyze_validation(_validation_payload(differences))

    assert analysis["verdict"] == "better"
    assert analysis["delta"]["withinDelta"] is False
    assert analysis["delta"]["directionEstablished"] is True


def test_analyze_validation_declares_worse_when_the_ci_clears_delta():
    differences = {seed: 9.0 + 0.5 * seed for seed in SEEDS}

    analysis = svc.analyze_validation(_validation_payload(differences))

    assert analysis["verdict"] == "worse"
    assert analysis["delta"]["medianKm"] > 0


def test_analyze_validation_does_not_certify_when_the_ci_crosses_delta():
    # El IC ni cabe en ±δ ni queda entero fuera: mejora apuntada, no certificada.
    differences = {
        42: -9.0,
        101: 0.2,
        202: -8.0,
        303: 0.3,
        404: -7.0,
        505: 0.1,
        606: -9.5,
        707: 0.4,
        808: -6.0,
        909: 0.0,
    }

    analysis = svc.analyze_validation(_validation_payload(differences))

    assert analysis["verdict"] == "not-comparable"
    assert analysis["delta"]["withinDelta"] is False
    assert "no material" in analysis["verdictReason"]


def test_analyze_validation_needs_a_single_control_and_a_single_candidate():
    payload = _validation_payload({seed: -1.0 for seed in SEEDS})
    # Se pierde el recomendado: solo queda el control.
    payload["runs"] = [run for run in payload["runs"] if run["acoBeta"] != 5.0]

    analysis = svc.analyze_validation(payload)

    assert analysis["comparable"] is False
    assert "control" in analysis["reason"]


def test_analyze_validation_refuses_without_shared_seeds():
    analysis = svc.analyze_validation(_validation_payload({42: -1.0}))

    assert analysis["comparable"] is False
    assert "semillas" in analysis["reason"]


def test_format_validation_analysis_renders_the_table():
    analysis = svc.analyze_validation(
        _validation_payload({seed: -10.0 - 0.5 * seed for seed in SEEDS})
    )
    text = "\n".join(svc.format_validation_analysis(analysis))

    assert "Validación replicada" in text
    assert "Control vs recomendado" in text
    assert "Veredicto" in text
    assert "better" in text


# --------------------------------------------------------------------------- #
# C5 · Superficie de respuesta local
# --------------------------------------------------------------------------- #


def _rsm_payload(*, drop: tuple[float, float, int] | None = None) -> dict[str, object]:
    """Payload Box-Behnken con una superficie cuadrática conocida y ruido pequeño."""
    recommended = _RECOMMENDED_STUB
    cases = svc.rsm_cases(recommended)
    runs: list[dict[str, object]] = []
    for coded, case in zip(svc.rsm_design(), cases):
        natural = (case["acoBeta"], case["acoRho"], case["acoIterations"])
        if drop is not None and tuple(natural) == drop:
            continue
        response = (
            200.0
            + 5.0 * coded[0]
            - 3.0 * coded[2]
            + 6.0 * coded[0] ** 2
            + 4.0 * coded[2] ** 2
        )
        for seed in SEEDS:
            # El ruido depende del **punto** (no del índice): los tres centros, que comparten
            # parámetros, reciben exactamente el mismo valor (como en una corrida real).
            point_signature = coded[0] * 3 + coded[1] * 5 + coded[2] * 7
            jitter = 0.2 * (((seed * 13 + point_signature * 7) % 11) - 5) / 5.0
            runs.append(
                _run(
                    seed=seed,
                    distance=response + jitter,
                    label=str(case["label"]),
                    acoBeta=case["acoBeta"],
                    acoRho=case["acoRho"],
                    acoIterations=case["acoIterations"],
                    acoAlpha=case["acoAlpha"],
                    acoPatience=case["acoPatience"],
                )
            )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "rsm",
        "runs": runs,
    }


def test_rsm_design_is_a_box_behnken_with_centers():
    design = svc.rsm_design()

    assert len(design) == 15
    assert design.count((0, 0, 0)) == svc.RSM_CENTER_REPLICATES
    # Ninguna arista tiene los tres factores fuera del centro (diseño esférico).
    assert all(sum(1 for value in point if value != 0) == 2 for point in design[:12])
    # Cada par de factores aparece en las cuatro combinaciones.
    edges = set(design[:12])
    assert len(edges) == 12


def test_rsm_levels_are_geometric_around_the_recommended_profile():
    levels = svc.rsm_levels(_RECOMMENDED_STUB)

    assert levels["acoBeta"] == (2.5, 5.0, 10.0)
    assert levels["acoRho"] == (0.06, 0.12, 0.24)
    assert levels["acoIterations"] == (10, 20, 40)


def test_analyze_rsm_recovers_a_known_quadratic_and_the_plateau():
    analysis = svc.analyze_rsm(_rsm_payload())

    assert analysis["comparable"] is True
    assert len(analysis["terms"]) == len(svc.RSM_TERMS)
    coefficients = {row["term"]: row["coefficientKm"] for row in analysis["terms"]}
    assert coefficients["beta"] == pytest.approx(5.0, abs=1.0)
    assert coefficients["beta2"] == pytest.approx(6.0, abs=1.0)
    assert coefficients["iterations"] == pytest.approx(-3.0, abs=1.0)
    assert coefficients["iterations2"] == pytest.approx(4.0, abs=1.0)
    assert coefficients["rho"] == pytest.approx(0.0, abs=0.5)

    plateau = analysis["plateau"]
    # β tiene óptimo interior: la meseta llega al borde bajo y se cierra antes del alto.
    assert plateau["acoBeta"]["naturalRange"][0] == 2.5
    assert plateau["acoBeta"]["naturalRange"][1] > 6.0
    assert plateau["acoBeta"]["naturalRange"][1] < 10.0
    # ρ es inerte: toda su recta entra en la meseta.
    assert plateau["acoRho"]["curvature"] == pytest.approx(0.0, abs=0.05)
    assert plateau["acoRho"]["naturalRange"] == [0.06, 0.24]


def test_analyze_rsm_reports_identical_centers():
    analysis = svc.analyze_rsm(_rsm_payload())

    assert analysis["centers"]["identical"] is True
    assert analysis["centers"]["sdKm"] is not None


def test_analyze_rsm_refuses_an_incomplete_design():
    payload = _rsm_payload(drop=(2.5, 0.06, 20.0))

    analysis = svc.analyze_rsm(payload)

    assert analysis["comparable"] is False
    assert "incompleto" in analysis["reason"]


def test_format_rsm_analysis_renders_the_tables():
    text = "\n".join(svc.format_rsm_analysis(svc.analyze_rsm(_rsm_payload())))

    assert "Box-Behnken" in text
    assert "Coeficientes" in text
    assert "Meseta de equivalencia" in text


# --------------------------------------------------------------------------- #
# T9 · Estadístico global
# --------------------------------------------------------------------------- #


def test_analyze_global_friedman_detects_the_known_effect_and_compares_against_the_best():
    analysis = svc.analyze_global(_factorial_payload())

    assert analysis["available"] is True
    assert analysis["configs"] == 16
    assert analysis["friedman"]["significant"] is True
    assert analysis["postHoc"] and len(analysis["postHoc"]) == 15
    # El post-hoc es la familia pre-declarada: cada esquina contra el mejor medido.
    assert all(row["right"] == analysis["best"] for row in analysis["postHoc"])
    # Las esquinas idénticas del payload (mismo β, sin efecto) dan diferencias nulas: no tienen
    # muestra y Holm las deja en `None` en vez de inventar un p-valor.
    assert any(row["pValueHolm"] is not None for row in analysis["postHoc"])
    assert any(row["pValueHolm"] is None for row in analysis["postHoc"])
    assert analysis["postHocSignificant"] > 0


def test_analyze_global_needs_three_configurations():
    payload = _factorial_payload()
    # Solo dos esquinas: Friedman no tiene tratamientos suficientes.
    keep = {payload["runs"][0]["label"], payload["runs"][-1]["label"]}
    payload["runs"] = [run for run in payload["runs"] if run["label"] in keep]

    analysis = svc.analyze_global(payload)

    assert analysis["available"] is False
    assert "2 semillas" in analysis["reason"] or "configuraciones" in analysis["reason"]


def test_format_global_analysis_renders_the_friedman_and_post_hoc():
    text = "\n".join(svc.format_global_analysis(svc.analyze_global(_factorial_payload())))

    assert "Friedman" in text
    assert "Post-hoc" in text
    assert "Holm" in text


# --------------------------------------------------------------------------- #
# C7 · pesos del objetivo (réplica de las candidatas)
# --------------------------------------------------------------------------- #


BLOCK_HOURS = 8


def _weight_run(
    *,
    seed: int,
    label: str,
    distance: float,
    hours: float,
    vehicles: int,
    uncovered: int,
    weight_balance: float = 0.0,
    weight_makespan: float = 0.0,
    min_active: int | None = None,
) -> dict[str, object]:
    """Corrida sintética de C7 tal como la registra ``_run_sensitivity_case``."""
    return {
        "label": f"C7 · {label} · semilla {seed}",
        "seed": seed,
        "durationHours": BLOCK_HOURS,
        "workloadBalanceWeightRequested": weight_balance,
        "makespanWeightRequested": weight_makespan,
        "minActiveVehiclesRequested": min_active,
        "distanceKmOptimized": distance,
        "distanceKmBaseline": BASELINE_KM,
        "maxRouteHours": hours,
        "activeVehicles": vehicles,
        "uncoveredPoints": uncovered,
        "acoIterationsRun": 20,
    }


def _weight_payload(*, makespan_effect: float = 0.3, uncovered: int = 0) -> dict[str, object]:
    """Réplica sintética: referencia (w = 0), un makespan dentro de δ y otro fuera.

    El efecto va **por semilla** (paridad con el ruido) para que la comparación pareada sea la
    que decide, no la diferencia de medianas de muestras independientes.
    """
    runs: list[dict[str, object]] = []
    for seed in SEEDS:
        noise = 0.1 * seed
        runs.append(
            _weight_run(
                seed=seed,
                label="base 8 h (w=0)",
                distance=165.0 + noise,
                hours=7.96,
                vehicles=8,
                uncovered=uncovered,
            )
        )
        runs.append(
            _weight_run(
                seed=seed,
                label="makespan 2",
                distance=165.0 + noise + makespan_effect,
                hours=7.91,
                vehicles=8,
                uncovered=uncovered,
                weight_makespan=2.0,
            )
        )
        runs.append(
            _weight_run(
                seed=seed,
                label="makespan 5",
                distance=165.0 + noise + 9.0,
                hours=7.87,
                vehicles=8,
                uncovered=uncovered,
                weight_makespan=5.0,
            )
        )
    return {
        "generatedAt": "2026-09-18T00:00:00+00:00",
        "scenarioId": "normal",
        "phase": "objective",
        "maxRouteHoursTarget": 8.0,
        "runs": runs,
    }


def _weight_source() -> dict[str, object]:
    """Barrido de pesos guardado (una semilla) del que salen las candidatas."""

    def source_run(
        label: str,
        *,
        distance: float,
        hours: float,
        vehicles: int,
        weight_balance: float = 0.0,
        weight_makespan: float = 0.0,
    ) -> dict[str, object]:
        # El barrido guardado usa etiquetas limpias (sin semilla): así las replica el CLI.
        return {
            "label": label,
            "durationHours": BLOCK_HOURS,
            "workloadBalanceWeight": weight_balance,
            "makespanWeight": weight_makespan,
            "minActiveVehiclesRequested": None,
            "distanceKmOptimized": distance,
            "maxRouteHours": hours,
            "activeVehicles": vehicles,
            "uncoveredPoints": 8,
        }

    return {
        "durationHours": BLOCK_HOURS,
        "maxRouteHoursTarget": 8.0,
        "runs": [
            source_run("base 8 h (w=0)", distance=165.7, hours=7.96, vehicles=8),
            source_run("equidad 2", distance=165.7, hours=7.96, vehicles=8, weight_balance=2.0),
            source_run("makespan 2", distance=166.0, hours=7.91, vehicles=8, weight_makespan=2.0),
            # Dominada por la referencia (más distancia, más makespan y menos flota): no es candidata.
            source_run("equidad 5", distance=170.0, hours=8.5, vehicles=7, weight_balance=5.0),
            source_run("makespan 5", distance=174.6, hours=7.87, vehicles=8, weight_makespan=5.0),
        ],
    }


def test_objective_candidate_cases_keep_the_reference_and_the_pareto_frontier():
    cases = svc.objective_candidate_cases(_weight_source())

    labels = [case["label"] for case in cases]
    assert labels[0] == "C7 · base 8 h (w=0)"
    assert "C7 · makespan 5" in labels
    # La fila dominada no se replica.
    assert "C7 · equidad 5" not in labels
    assert len(cases) == 3
    assert all((case["acoAnts"], case["acoIterations"]) == (12, 20) for case in cases)
    assert all(case["acoPatience"] == 0 for case in cases)


def test_objective_candidate_cases_refuse_a_sweep_without_the_8h_block():
    with pytest.raises(ValueError, match="bloque de 8 h"):
        svc.objective_candidate_cases({"runs": [{"durationHours": None, "distanceKmOptimized": 1.0}]})


def test_analyze_objective_measures_ac_on_the_median_and_the_paired_delta():
    analysis = svc.analyze_objective(_weight_payload())

    assert analysis["comparable"] is True
    assert analysis["ac2"]["ok"] is True
    assert analysis["ac1"]["ok"] is True
    rows = {row["label"]: row for row in analysis["points"]}
    # El Δ pareado distingue lo que δ declara: 0.3 km equivalente, 9 km material.
    assert rows["8 h · makespan 2"]["vsBaseline"]["verdict"] == "equivalente"
    assert rows["8 h · makespan 5"]["vsBaseline"]["verdict"] == "difiere"
    assert analysis["distanceInert"] is False
    # La frontera son las tres medianas (ninguna domina a las otras).
    assert len(analysis["frontier"]["labels"]) == 3
    assert analysis["frontier"]["hypervolume"]["value"] > 0
    assert analysis["frontier"]["hypervolume"]["ci"] is not None


def test_analyze_objective_declares_that_ac2_does_not_hold_with_uncovered_points():
    analysis = svc.analyze_objective(_weight_payload(uncovered=8))

    # Las filas con puntos sin cubrir **no** se descartan: son el resultado de AC-2.
    assert len(analysis["points"]) == 3
    assert analysis["ac2"]["ok"] is False
    assert analysis["ac2"]["candidates"] == []
    assert "no se sostiene" in analysis["ac2Reason"]
    assert "8" in analysis["ac2Reason"]


def test_analyze_objective_needs_the_reference_row():
    payload = _weight_payload()
    payload["runs"] = [run for run in payload["runs"] if run["workloadBalanceWeightRequested"] or run["makespanWeightRequested"]]

    analysis = svc.analyze_objective(payload)

    assert analysis["comparable"] is False
    assert "referencia" in (analysis["reason"] or "")


def test_analyze_objective_flags_a_run_without_the_block():
    analysis = svc.analyze_objective({"runs": [{"durationHours": None, "distanceKmOptimized": 1.0}]})

    assert analysis["comparable"] is False
    assert analysis["points"] == []


def test_format_objective_analysis_renders_the_table_and_the_criteria():
    text = "\n".join(svc.format_objective_analysis(svc.analyze_objective(_weight_payload(uncovered=8))))

    assert "C7 · Pesos del objetivo" in text
    assert "AC-2" in text
    assert "Frontera de Pareto" in text
    assert "hipervolumen" in text
    assert "Sin cubrir" in text


# --------------------------------------------------------------------------- #
# E8 · Reporte del capítulo
# --------------------------------------------------------------------------- #


def test_report_lines_declares_missing_evidence_and_cites_the_ids():
    from scripts.calibration_method import report_lines

    factorial = _coupled_factorial_payload()
    entries = {
        "factorial": (4, factorial),
        "validate": (13, _validation_payload({seed: -10.0 - 0.5 * seed for seed in SEEDS})),
    }

    text = "\n".join(report_lines(entries))

    assert "Evidencia — Calibración metodológica" in text
    assert "| factorial | id 4 |" in text
    assert "| validate | id 13 |" in text
    # Las fases sin evidencia se declaran en vez de omitirse.
    assert "_Sin evidencia de C1._" in text
    assert "_Sin evidencia de C5._" in text
    assert "_Sin evidencia de C7._" in text
    assert "Validación replicada" in text
    assert "Pendiente" in text


def test_report_lines_needs_the_reference_factorial():
    from scripts.calibration_method import report_lines

    with pytest.raises(ValueError):
        report_lines({"factorial": None})


def test_report_path_points_to_the_phase_13_evidence_document():
    from scripts.calibration_method import _report_path

    path = _report_path()

    assert path.name == "evidencia-calibracion-metodologica.md"
    assert path.parent.name == "fase-13"
    assert path.parent.parent.name == "docs"


def test_seed_count_reads_root_seeds_or_budget_replicates():
    from scripts.calibration_method import _seed_count

    assert _seed_count({"seeds": [42, 101, 202]}) == 3
    assert _seed_count({"budget": {"replicates": 10}}) == 10
    assert _seed_count({}) == 0


# --------------------------------------------------------------------------- #
# Ayudantes estadísticos reutilizables
# --------------------------------------------------------------------------- #


def test_holm_adjust_is_step_down_and_keeps_missing_contrasts():
    adjusted = holm_adjust([0.001, 0.02, 0.04, None])

    assert adjusted[0] == pytest.approx(0.003)
    assert adjusted[1] == pytest.approx(0.04)
    assert adjusted[2] == pytest.approx(0.04)
    assert adjusted[3] is None


def test_paired_wilcoxon_needs_enough_nonzero_pairs():
    result = paired_wilcoxon([0.0, 0.0, 0.0, 1.0])

    assert result["pValue"] is None
    assert result["nEffective"] == 1
    assert result["significant"] is False


def test_paired_wilcoxon_detects_a_consistent_direction():
    result = paired_wilcoxon([2.0, 3.0, 1.5, 4.0, 2.5, 3.5, 2.0, 3.0, 1.0, 4.5])

    assert result["pValue"] == pytest.approx(0.001953125)
    assert result["significant"] is True
    assert result["alternative"] == "two-sided"


def test_required_n_grows_with_noise_and_shrinks_with_delta():
    assert required_n(3.0, 5.0) >= required_n(1.0, 5.0)
    assert required_n(3.0, 5.0) > required_n(3.0, 10.0)
    assert required_n(3.0, 0.0) == 0


def test_cliffs_delta_is_signed_and_bounded():
    assert cliffs_delta([3, 4, 5], [1, 2, 0]) == 1.0
    assert cliffs_delta([1, 2, 0], [3, 4, 5]) == -1.0
