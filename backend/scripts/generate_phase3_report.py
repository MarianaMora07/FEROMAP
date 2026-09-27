"""Genera reporte markdown Fase 3 desde la evidencia guardada en la BD."""

from __future__ import annotations

from pathlib import Path

from app.db.session import SessionLocal
from app.services.aco_sensitivity_service import load_aco_sensitivity
from app.services.benchmark_service import ACO_BENCHMARK_PROFILES, load_aco_benchmark

SEARCH_AXES = {"ants", "iterations"}
HYPERPARAMETER_AXES = {"alpha", "beta", "rho", "q"}


def _repo_root() -> Path:
    """Raíz del repo, robusta al contenedor.

    En el host el script vive en ``<repo>/backend/scripts``, o sea ``parents[2]`` es la
    raíz. Dentro del contenedor, en cambio, ``/app`` es el montaje de ``backend`` y
    ``/app/docs`` el de ``docs``: ``parents[2]`` sería ``/`` y el reporte se perdería
    fuera del repo. Por eso se ancla a la primera carpeta que contenga ``docs/fase-3``.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "docs" / "fase-3").is_dir():
            return parent
    return here.parents[2]


def _report_path() -> Path:
    return _repo_root() / "docs" / "fase-3" / "evidencia-aco.md"


def _fmt_param(value: object) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _sensitivity_tables(sensitivity: dict) -> list[str]:
    runs = sensitivity.get("runs", [])
    generated = sensitivity.get("generatedAt", "—")
    duration = sensitivity.get("durationSeconds", "—")
    seed = sensitivity.get("seed", "—")
    lines = [
        f"**Generado:** {generated} · **Duración:** {duration} s · **Semilla:** {seed}",
        "",
        "KPI de referencia: **distancia optimizada** (D2). El resto de columnas son guardarraíles.",
        "",
        "### Hormigas e iteraciones",
        "",
        "| Configuración | Hormigas | Iteraciones | CPU (s) | Distancia (km) | Iter. ejecutadas |",
        "|---------------|----------|-------------|---------|----------------|------------------|",
    ]
    search_runs = [run for run in runs if run.get("axis") in SEARCH_AXES]
    for run in search_runs:
        if run.get("error"):
            lines.append(f"| {run.get('label')} | — | — | — | — | ERROR |")
        else:
            label = run.get("label")
            ants = run.get("acoAnts")
            iterations = run.get("acoIterations")
            seconds = run.get("computationSeconds")
            km = run.get("distanceKmOptimized")
            iterations_run = run.get("acoIterationsRun")
            lines.append(f"| {label} | {ants} | {iterations} | {seconds} | {km} | {iterations_run} |")
    ok_search = [run for run in search_runs if "error" not in run]
    if ok_search:
        best = min(ok_search, key=lambda run: run["distanceKmOptimized"])
        fastest = min(ok_search, key=lambda run: run["computationSeconds"])
        traffic_line = f"- Mejor distancia: {best['label']} → {best['distanceKmOptimized']} km ({best['computationSeconds']} s)"
        fast_line = f"- Más rápido: {fastest['label']} → {fastest['distanceKmOptimized']} km ({fastest['computationSeconds']} s)"
        lines.extend(
            [
                "",
                "**Trade-off distancia vs tiempo:**",
                traffic_line,
                fast_line,
                "",
                "El perfil **12 hormigas × 20 iteraciones** queda en el punto medio operativo entre calidad de solución y costo computacional.",
            ]
        )

    hyper_runs = [run for run in runs if run.get("axis") in HYPERPARAMETER_AXES]
    if hyper_runs:
        lines.extend(
            [
                "",
                "### Hiperparámetros ACO (α, β, ρ, Q)",
                "",
                "| Configuración | α | β | ρ | Q | CPU (s) | Distancia (km) | Iter. ejecutadas |",
                "|---------------|---|---|---|---|---------|----------------|------------------|",
            ]
        )
        for run in hyper_runs:
            if run.get("error"):
                lines.append(f"| {run.get('label')} | — | — | — | — | — | — | ERROR |")
                continue
            label = run.get("label")
            alpha = _fmt_param(run.get("acoAlpha"))
            beta = _fmt_param(run.get("acoBeta"))
            rho = _fmt_param(run.get("acoRho"))
            q_value = _fmt_param(run.get("pheromoneQ"))
            seconds = run.get("computationSeconds")
            km = run.get("distanceKmOptimized")
            iterations_run = run.get("acoIterationsRun")
            lines.append(
                f"| {label} | {alpha} | {beta} | {rho} | {q_value} | {seconds} | {km} | {iterations_run} |"
            )
        ok_hyper = [run for run in hyper_runs if "error" not in run]
        if ok_hyper:
            best_hyper = min(ok_hyper, key=lambda run: run["distanceKmOptimized"])
            lines.append("")
            lines.append(
                f"**Mejor configuración (distancia):** {best_hyper['label']} → {best_hyper['distanceKmOptimized']} km ({best_hyper['computationSeconds']} s)."
            )
        standard = sensitivity.get("standardHyperparameters") or {}
        if standard:
            formatted = ", ".join(f"{key}={value:g}" for key, value in standard.items())
            lines.append(f"Valores estándar evaluados: {formatted}.")
    return lines


def build_report(db) -> str:
    benchmark = load_aco_benchmark()
    sensitivity = load_aco_sensitivity(db)
    lines = [
        "# Evidencia ACO — Fase 3 (rigor algorítmico)",
        "",
        "> Generado automáticamente. Regenerar: `just phase3-report`",
        "",
        "## Perfiles de benchmark (5 escenarios × 3 perfiles)",
        "",
    ]

    if benchmark:
        generated = benchmark.get("generatedAt", "—")
        duration = benchmark.get("durationSeconds", "—")
        lines.extend(
            [
                f"**Generado:** {generated} · **Duración:** {duration} s",
                "",
                "| Escenario | Perfil | CPU (s) | Distancia ACO (km) | Iter. ejecutadas | Ahorro % |",
                "|-----------|--------|---------|--------------------|--------------------|----------|",
            ]
        )
        for run in benchmark.get("runs", []):
            if run.get("error"):
                scenario_label = run.get("scenarioLabel")
                profile_label = run.get("profileLabel")
                lines.append(f"| {scenario_label} | {profile_label} | — | — | — | ERROR |")
            else:
                scenario_label = run.get("scenarioLabel")
                profile_label = run.get("profileLabel")
                seconds = run.get("computationSeconds")
                km = run.get("distanceKmOptimized")
                iterations_run = run.get("acoIterationsRun")
                saving = run.get("savingPct")
                lines.append(
                    f"| {scenario_label} | {profile_label} | {seconds} | {km} | {iterations_run} | {saving} |"
                )
        standard = [
            run
            for run in benchmark.get("runs", [])
            if run.get("profileId") == "standard" and "error" not in run
        ]
        if standard:
            avg_cpu = sum(run["computationSeconds"] for run in standard) / len(standard)
            lines.append(
                f"**Justificación 12×20:** perfil estándar con CPU media ≈ {avg_cpu:.1f} s en {len(standard)} escenarios (balance calidad/tiempo)."
            )
    else:
        lines.append("_Sin benchmark. Ejecuta `just benchmark-aco`._")

    lines.extend(["", "## Sensibilidad de parámetros (escenario normal)", ""])

    if sensitivity:
        lines.extend(_sensitivity_tables(sensitivity))
    else:
        lines.append("_Sin sensibilidad. Ejecuta `just phase3-sensitivity`._")

    lines.extend(
        [
            "",
            "## Perfiles de referencia",
            "",
            "| ID | Etiqueta | Hormigas | Iteraciones |",
            "|----|----------|----------|-------------|",
        ]
    )
    for profile in ACO_BENCHMARK_PROFILES:
        profile_id = profile["id"]
        profile_label = profile["label"]
        ants = profile["acoAnts"]
        iterations = profile["acoIterations"]
        lines.append(f"| `{profile_id}` | {profile_label} | {ants} | {iterations} |")

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    with SessionLocal() as db:
        report = build_report(db)
    path = _report_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")
    print(f"✅ Reporte Fase 3: {path}")


if __name__ == "__main__":
    main()
