"""Genera reporte markdown Fase 3 desde benchmarks en caché."""

from __future__ import annotations

from pathlib import Path

from app.services.aco_sensitivity_service import load_aco_sensitivity
from app.services.benchmark_service import ACO_BENCHMARK_PROFILES, load_aco_benchmark


def _report_path() -> Path:
    root = Path(__file__).resolve().parents[2]
    return root / "docs" / "fase-3" / "evidencia-aco.md"


def build_report() -> str:
    benchmark = load_aco_benchmark()
    sensitivity = load_aco_sensitivity()
    lines = [
        "# Evidencia ACO — Fase 3 (rigor algorítmico)",
        "",
        "> Generado automáticamente. Regenerar: `just phase3-report`",
        "",
        "## Perfiles de benchmark (5 escenarios × 3 perfiles)",
        "",
    ]

    if benchmark:
        lines.extend(
            [
                f"**Generado:** {benchmark.get('generatedAt', '—')} · "
                f"**Duración:** {benchmark.get('durationSeconds', '—')} s",
                "",
                "| Escenario | Perfil | CPU (s) | Distancia ACO (km) | Iter. ejecutadas | Ahorro % |",
                "|-----------|--------|---------|--------------------|--------------------|----------|",
            ]
        )
        for run in benchmark.get("runs", []):
            if run.get("error"):
                lines.append(
                    f"| {run.get('scenarioLabel')} | {run.get('profileLabel')} "
                    f"| — | — | — | ERROR |"
                )
            else:
                lines.append(
                    f"| {run.get('scenarioLabel')} | {run.get('profileLabel')} "
                    f"| {run.get('computationSeconds')} "
                    f"| {run.get('distanceKmOptimized')} "
                    f"| {run.get('acoIterationsRun')} "
                    f"| {run.get('savingPct')} |"
                )
        standard = [
            run
            for run in benchmark.get("runs", [])
            if run.get("profileId") == "standard" and "error" not in run
        ]
        if standard:
            avg_cpu = sum(run["computationSeconds"] for run in standard) / len(standard)
            lines.extend(
                [
                    "",
                    f"**Justificación 12×20:** perfil estándar con CPU media ≈ {avg_cpu:.1f} s en "
                    f"{len(standard)} escenarios (balance calidad/tiempo).",
                ]
            )
    else:
        lines.append("_Sin benchmark. Ejecuta `just benchmark-aco`._")

    lines.extend(
        [
            "",
            "## Sensibilidad de parámetros (escenario normal)",
            "",
        ]
    )

    if sensitivity:
        lines.extend(
            [
                f"**Generado:** {sensitivity.get('generatedAt', '—')} · "
                f"**Duración:** {sensitivity.get('durationSeconds', '—')} s",
                "",
                "| Configuración | Hormigas | Iteraciones | CPU (s) | Distancia (km) | Iter. ejecutadas |",
                "|---------------|----------|-------------|---------|----------------|------------------|",
            ]
        )
        for run in sensitivity.get("runs", []):
            if run.get("error"):
                lines.append(f"| {run.get('label')} | — | — | — | — | ERROR |")
            else:
                lines.append(
                    f"| {run.get('label')} | {run.get('acoAnts')} | {run.get('acoIterations')} "
                    f"| {run.get('computationSeconds')} | {run.get('distanceKmOptimized')} "
                    f"| {run.get('acoIterationsRun')} |"
                )
        ok_runs = [run for run in sensitivity.get("runs", []) if "error" not in run]
        if ok_runs:
            best = min(ok_runs, key=lambda run: run["distanceKmOptimized"])
            fastest = min(ok_runs, key=lambda run: run["computationSeconds"])
            lines.extend(
                [
                    "",
                    "**Trade-off distancia vs tiempo:**",
                    f"- Mejor distancia: {best['label']} → {best['distanceKmOptimized']} km "
                    f"({best['computationSeconds']} s)",
                    f"- Más rápido: {fastest['label']} → {fastest['distanceKmOptimized']} km "
                    f"({fastest['computationSeconds']} s)",
                    "",
                    "El perfil **12 hormigas × 20 iteraciones** queda en el punto medio operativo "
                    "entre calidad de solución y costo computacional.",
                ]
            )
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
        lines.append(
            f"| `{profile['id']}` | {profile['label']} | {profile['acoAnts']} | {profile['acoIterations']} |"
        )

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    path = _report_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")
    print(f"✅ Reporte Fase 3: {path}")


if __name__ == "__main__":
    main()
