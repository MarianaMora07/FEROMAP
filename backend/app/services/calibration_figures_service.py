"""Figuras del reporte de calibración (F1–F4) como PNG.

El reporte es markdown, así que las figuras se escriben **junto a él** y se referencian por ruta
relativa (``![F1](f1-convergencia.png)``). Matplotlib se usa con el backend ``Agg`` (sin
pantalla) y un estilo mínimo: lo que importa es que la figura sea legible y reproducible.

Qué dibuja cada una (plan §C8):

- **F1 · convergencia**: mejor-hasta-`k` vs `k`, mediana + IQR, un panel por factor con el nivel
  bajo y el alto. La serie ya viaja en el payload de cada corrida (`acoConvergence`).
- **F2 · efectos principales**: mediana de la distancia por nivel, con IC bootstrap de la
  mediana por celda.
- **F3 · interacciones**: el efecto de un factor partido por el nivel de otro; los pares que el
  diseño marcó materiales.
- **F4 · frontera de Pareto (pesos)**: distancia vs makespan con el número de vehículos activos.
  Necesita la evidencia replicada de C7; si no está, no se genera.

La preparación de datos es **pura** (se prueba aparte) y el renderizado solo se dispara cuando
hay evidencia, así que regenerar el reporte sin CPU sigue siendo posible.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")  # Sin pantalla: el reporte corre en el contenedor.

import matplotlib.pyplot as plt  # noqa: E402  (después de fijar el backend)
import numpy as np  # noqa: E402

from app.services.calibration_method_service import (  # noqa: E402
    FACTORS,
    FACTOR_SYMBOLS,
    _coded_level,
    _config_key,
    _valid_runs,
    bootstrap_ci,
)

# Pares de factores cuya interacción se dibuja (los materiales en el diseño de C3).
INTERACTION_PAIRS: tuple[tuple[str, str], ...] = (("acoBeta", "acoRho"), ("acoBeta", "acoPatience"))

FIGURE_NAMES: dict[str, str] = {
    "f1": "f1-convergencia.png",
    "f2": "f2-efectos.png",
    "f3": "f3-interacciones.png",
    "f4": "f4-frontera.png",
}


# --------------------------------------------------------------------------- #
# Preparación de datos (pura)
# --------------------------------------------------------------------------- #


def corner_cells(payload: dict[str, Any]) -> dict[tuple[int, ...], dict[int, float]]:
    """Esquinas del factorial como ``niveles codificados → {semilla: distancia}``."""
    cells: dict[tuple[int, ...], dict[int, float]] = {}
    for run in _valid_runs(payload):
        params = _config_key(run)
        seed = run.get("seed")
        if params is None or seed is None or run.get("distanceKmOptimized") is None:
            continue
        levels = tuple(
            _coded_level(low, high, center, params[index])
            for index, (_factor, low, high, center) in enumerate(FACTORS)
        )
        if any(level is None for level in levels):
            continue
        cells.setdefault(levels, {})[int(seed)] = float(run["distanceKmOptimized"])
    return cells


def _shared_seeds(cells: dict[tuple[int, ...], dict[int, float]]) -> list[int]:
    if not cells:
        return []
    return sorted(set.intersection(*(set(cell) for cell in cells.values())))


def _level_samples(cells, index: int, level: int, seeds: list[int]) -> list[float]:
    """Una mediana por semilla sobre las celdas con ese nivel en ese factor."""
    samples: list[float] = []
    for seed in seeds:
        values = [
            cell[seed]
            for key, cell in cells.items()
            if key[index] == level and seed in cell
        ]
        if values:
            samples.append(float(np.median(values)))
    return samples


def main_effect_series(payload: dict[str, Any]) -> dict[str, Any]:
    """Mediana e IC 95 % de cada nivel, por factor (para F2)."""
    cells = corner_cells(payload)
    seeds = _shared_seeds(cells)
    if not seeds:
        return {"available": False}
    series: dict[str, Any] = {"available": True, "factors": {}}
    for index, (factor, low, high, center) in enumerate(FACTORS):
        levels = []
        for level, value in ((-1, low), (0, center), (1, high)):
            samples = _level_samples(cells, index, level, seeds)
            interval = bootstrap_ci(samples)
            levels.append(
                {
                    "level": level,
                    "value": float(value),
                    "medianKm": round(float(np.median(samples)), 2) if samples else None,
                    "ci": [round(interval[0], 2), round(interval[1], 2)] if interval else None,
                    "n": len(samples),
                }
            )
        series["factors"][factor] = {
            "symbol": FACTOR_SYMBOLS.get(factor, factor),
            "levels": levels,
        }
    return series


def interaction_series(payload: dict[str, Any], left: str, right: str) -> dict[str, Any]:
    """Mediana por nivel de ``left``, una serie por nivel de ``right`` (para F3)."""
    cells = corner_cells(payload)
    seeds = _shared_seeds(cells)
    names = [factor for factor, *_rest in FACTORS]
    if left not in names or right not in names or not seeds:
        return {"available": False}
    i, j = names.index(left), names.index(right)
    _low_i, high_i, _c_i = (factor for factor in FACTORS if factor[0] == left).__next__()[1:]
    right_levels = (-1, 1)
    series: list[dict[str, Any]] = []
    for right_level in right_levels:
        points = []
        for left_level in (-1, 1):
            samples = []
            for seed in seeds:
                values = [
                    cell[seed]
                    for key, cell in cells.items()
                    if key[i] == left_level and key[j] == right_level and seed in cell
                ]
                if values:
                    samples.append(float(np.median(values)))
            points.append(
                {
                    "level": left_level,
                    "medianKm": round(float(np.median(samples)), 2) if samples else None,
                }
            )
        series.append({"rightLevel": right_level, "points": points})
    return {
        "available": True,
        "left": {"key": left, "symbol": FACTOR_SYMBOLS.get(left, left)},
        "right": {"key": right, "symbol": FACTOR_SYMBOLS.get(right, right)},
        "series": series,
    }


def _best_so_far(series: list[dict[str, Any]], iterations: int) -> list[float | None]:
    """Mejor distancia hasta cada iteración (lleva el valor hacia adelante si la corrida cortó)."""
    by_iteration: dict[int, float] = {}
    running: float | None = None
    for point in series:
        iteration = point.get("iteration")
        value = point.get("bestDistanceKm")
        if iteration is None or value is None:
            continue
        running = float(value) if running is None else min(running, float(value))
        by_iteration[int(iteration)] = running
    out: list[float | None] = []
    current: float | None = None
    for k in range(1, iterations + 1):
        if k in by_iteration:
            current = by_iteration[k]
        out.append(current)
    return out


def convergence_series(payload: dict[str, Any]) -> dict[str, Any]:
    """Mediana e IQR del mejor-hasta-`k` por factor y nivel (para F1)."""
    runs = _valid_runs(payload)
    if not runs:
        return {"available": False}
    max_iteration = 0
    for run in runs:
        series = run.get("acoConvergence") or []
        if isinstance(series, list):
            max_iteration = max(max_iteration, len(series))
    if max_iteration == 0:
        return {"available": False}

    panels: dict[str, Any] = {}
    for index, (factor, low, high, center) in enumerate(FACTORS):
        by_level: dict[int, list[list[float | None]]] = {-1: [], 1: []}
        for run in runs:
            params = _config_key(run)
            series = run.get("acoConvergence") or []
            if params is None or not isinstance(series, list) or not series:
                continue
            level = _coded_level(low, high, center, params[index])
            if level not in by_level:
                continue
            by_level[level].append(_best_so_far(series, max_iteration))
        levels: dict[str, Any] = {}
        for level, runs_series in by_level.items():
            if not runs_series:
                continue
            matrix = np.asarray(
                [
                    [np.nan if value is None else value for value in values]
                    for values in runs_series
                ],
                dtype=float,
            )
            with np.errstate(all="ignore"):
                median = np.nanmedian(matrix, axis=0)
                q1 = np.nanpercentile(matrix, 25, axis=0)
                q3 = np.nanpercentile(matrix, 75, axis=0)
            levels[str(level)] = {
                "median": [None if np.isnan(v) else round(float(v), 2) for v in median],
                "q1": [None if np.isnan(v) else round(float(v), 2) for v in q1],
                "q3": [None if np.isnan(v) else round(float(v), 2) for v in q3],
            }
        panels[factor] = {
            "symbol": FACTOR_SYMBOLS.get(factor, factor),
            "low": float(low),
            "high": float(high),
            "levels": levels,
        }
    return {"available": True, "iterations": max_iteration, "panels": panels}


# --------------------------------------------------------------------------- #
# Renderizado
# --------------------------------------------------------------------------- #


def _finish(fig, path: Path) -> Path:
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return path


def render_convergence(payload: dict[str, Any], path: Path) -> Path | None:
    """F1 — mejor-hasta-`k` vs `k`, mediana + IQR, un panel por factor."""
    data = convergence_series(payload)
    if not data.get("available"):
        return None
    panels = list(data["panels"].items())
    fig, axes = plt.subplots(2, 2, figsize=(10, 7), sharex=True)
    iterations = list(range(1, data["iterations"] + 1))
    for axis, (factor, panel) in zip(np.ravel(axes), panels, strict=False):
        for level, style, label in (("-1", "-", "bajo"), ("1", "--", "alto")):
            series = panel["levels"].get(level)
            if not series:
                continue
            axis.plot(iterations, series["median"], style, label=label, linewidth=1.6)
            axis.fill_between(iterations, series["q1"], series["q3"], alpha=0.15)
        axis.set_title(f"{panel['symbol']} ({panel['low']:g} vs {panel['high']:g})", fontsize=10)
        axis.grid(alpha=0.25, linewidth=0.5)
        axis.legend(fontsize=8)
    for axis in np.ravel(axes)[-2:]:
        axis.set_xlabel("iteración")
    for axis in np.ravel(axes)[::2]:
        axis.set_ylabel("mejor distancia (km)")
    fig.suptitle("F1 · Convergencia por factor (mediana e IQR entre semillas)", fontsize=11)
    return _finish(fig, path)


def render_main_effects(payload: dict[str, Any], path: Path) -> Path | None:
    """F2 — mediana por nivel con IC bootstrap de la mediana."""
    data = main_effect_series(payload)
    if not data.get("available"):
        return None
    factors = list(data["factors"].items())
    fig, axes = plt.subplots(2, 2, figsize=(10, 7))
    for axis, (factor, panel) in zip(np.ravel(axes), factors, strict=False):
        levels = [row for row in panel["levels"] if row["medianKm"] is not None]
        positions = list(range(len(levels)))
        axis.errorbar(
            positions,
            [row["medianKm"] for row in levels],
            yerr=[
                [row["medianKm"] - (row["ci"] or [row["medianKm"], row["medianKm"]])[0] for row in levels],
                [(row["ci"] or [row["medianKm"], row["medianKm"]])[1] - row["medianKm"] for row in levels],
            ],
            marker="o",
            linewidth=1.6,
            capsize=4,
        )
        axis.set_xticks(positions)
        axis.set_xticklabels(
            [("estándar" if row["level"] == 0 else f"{row['value']:g}") for row in levels],
            fontsize=8,
        )
        axis.set_title(panel["symbol"], fontsize=10)
        axis.grid(alpha=0.25, linewidth=0.5)
        axis.set_ylabel("distancia (km)")
    fig.suptitle("F2 · Efectos principales (mediana por nivel, IC 95 %)", fontsize=11)
    return _finish(fig, path)


def render_interactions(payload: dict[str, Any], path: Path) -> Path | None:
    """F3 — el efecto de un factor partido por el nivel del otro."""
    rendered = 0
    fig, axes = plt.subplots(1, len(INTERACTION_PAIRS), figsize=(5 * len(INTERACTION_PAIRS), 4))
    axes = np.atleast_1d(axes)
    for axis, (left, right) in zip(axes, INTERACTION_PAIRS):
        data = interaction_series(payload, left, right)
        if not data.get("available"):
            continue
        for series in data["series"]:
            points = [point for point in series["points"] if point["medianKm"] is not None]
            if not points:
                continue
            axis.plot(
                [point["level"] for point in points],
                [point["medianKm"] for point in points],
                marker="o",
                linewidth=1.6,
                label=f"{data['right']['symbol']} {'bajo' if series['rightLevel'] == -1 else 'alto'}",
            )
        axis.set_xticks([-1, 1])
        axis.set_xlim(-1.4, 1.4)
        axis.set_xlabel(data["left"]["symbol"])
        axis.set_ylabel("distancia (km)")
        axis.set_title(f"{data['left']['symbol']} × {data['right']['symbol']}", fontsize=10)
        axis.grid(alpha=0.25, linewidth=0.5)
        axis.legend(fontsize=8)
        rendered += 1
    if not rendered:
        plt.close(fig)
        return None
    fig.suptitle("F3 · Interacciones materiales", fontsize=11)
    return _finish(fig, path)


def render_pareto(objective_analysis: dict[str, Any], path: Path) -> Path | None:
    """F4 — frontera de Pareto del barrido de pesos replicado (C7)."""
    points = (objective_analysis or {}).get("points") or []
    usable = [
        point
        for point in points
        if point.get("maxRouteHours") is not None and point.get("medianKm") is not None
    ]
    if not usable:
        return None
    fig, axis = plt.subplots(figsize=(7, 5))
    axis.scatter(
        [point["maxRouteHours"] for point in usable],
        [point["medianKm"] for point in usable],
        s=[12 * max(1, point.get("activeVehicles") or 1) for point in usable],
        c=[point.get("activeVehicles") or 0 for point in usable],
        cmap="viridis",
        alpha=0.85,
        edgecolors="black",
        linewidths=0.5,
    )
    for point in usable:
        if point.get("ci"):
            axis.errorbar(
                point["maxRouteHours"],
                point["medianKm"],
                yerr=[[point["medianKm"] - point["ci"][0]], [point["ci"][1] - point["medianKm"]]],
                fmt="none",
                ecolor="gray",
                linewidth=0.8,
                capsize=3,
            )
        axis.annotate(point["label"], (point["maxRouteHours"], point["medianKm"]), fontsize=7)
    axis.set_xlabel("máx. horas por ruta")
    axis.set_ylabel("distancia mediana (km)")
    axis.set_title("F4 · Frontera de Pareto (tamaño/color = vehículos activos)", fontsize=11)
    axis.grid(alpha=0.25, linewidth=0.5)
    return _finish(fig, path)


def render_figures(
    payload: dict[str, Any],
    output_dir: Path,
    *,
    objective_analysis: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Genera las figuras posibles y devuelve ``{clave: nombre de fichero}``.

    F1–F3 salen del factorial; F4 solo si hay evidencia replicada del barrido de pesos (C7).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    produced: dict[str, str] = {}
    renderers = (
        ("f1", render_convergence, payload),
        ("f2", render_main_effects, payload),
        ("f3", render_interactions, payload),
    )
    for key, renderer, source in renderers:
        name = FIGURE_NAMES[key]
        if renderer(source, output_dir / name) is not None:
            produced[key] = name
    if objective_analysis:
        name = FIGURE_NAMES["f4"]
        if render_pareto(objective_analysis, output_dir / name) is not None:
            produced["f4"] = name
    return produced


FIGURE_CAPTIONS: dict[str, str] = {
    "f1": "F1 · Convergencia: mejor-hasta-`k` vs `k`, mediana e IQR entre semillas",
    "f2": "F2 · Efectos principales: mediana por nivel con IC 95 %",
    "f3": "F3 · Interacciones materiales del diseño",
    "f4": "F4 · Frontera de Pareto del barrido de pesos replicado",
}


def figures_markdown(produced: dict[str, str]) -> list[str]:
    """Sección de figuras del reporte, con enlaces relativos al propio documento."""
    if not produced:
        return ["", "## Figuras", "", "_Sin figuras: falta la evidencia del factorial._", ""]
    lines: list[str] = ["", "## Figuras", ""]
    for key in ("f1", "f2", "f3", "f4"):
        name = produced.get(key)
        if name:
            lines += [f"### {FIGURE_CAPTIONS[key]}", "", f"![{key}]({name})", ""]
    missing = [key for key in ("f4",) if key not in produced]
    if missing:
        lines += [
            "_F4 no se genera: requiere la evidencia replicada del barrido de pesos (C7)._",
            "",
        ]
    return lines
