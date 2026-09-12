"""Benchmark comparativo de familias (Fase 7): ACO vs heurísticas vs OR-Tools.

Ejecuta ``run_algorithms_benchmark`` (instancias controladas, sin BD) y resume por
familia: distancia media, CPU media y estabilidad del plan. OR-Tools solo aparece si
la dependencia opcional está instalada.

Uso:
    python -m scripts.benchmark_algorithms
"""

from __future__ import annotations

from collections import defaultdict

from app.domain.ortools_baseline import available as ortools_available
from app.services.algorithm_benchmark_service import (
    FAMILY_LABELS,
    run_algorithms_benchmark,
)


def _summary(runs: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for run in runs:
        grouped[run["family"]].append(run)

    order = ["aco", "ortools", "clarke_wright", "genetic", "regret", "alns"]
    summary: list[dict] = []
    for family in order:
        entries = grouped.get(family)
        if not entries:
            continue
        count = len(entries)
        summary.append(
            {
                "family": family,
                "label": FAMILY_LABELS.get(family, family),
                "meanDistanceKm": round(sum(e["distanceKm"] for e in entries) / count, 2),
                "meanCpuSeconds": round(sum(e["cpuSeconds"] for e in entries) / count, 3),
                "meanStabilityPct": round(sum(e["stabilityPct"] for e in entries) / count, 1),
                "uncovered": sum(e["uncoveredCount"] for e in entries),
            }
        )
    return summary


def main() -> None:
    if not ortools_available():
        print("ℹ️  OR-Tools no está instalado: se omite el baseline exacto (opcional F7).")
    payload = run_algorithms_benchmark()

    print(f"\nBenchmark de familias — {payload['durationSeconds']} s, {len(payload['runs'])} corridas")
    print(f"Escenarios: {', '.join(payload['scenarios'])} | Tamaños: {payload['instanceSizes']}\n")
    header = f"{'Familia':<24}{'Dist media (km)':>16}{'CPU media (s)':>15}{'Estabilidad %':>15}{'Sin cubrir':>12}"
    print(header)
    print("-" * len(header))
    for row in _summary(payload["runs"]):
        print(
            f"{row['label']:<24}{row['meanDistanceKm']:>16.2f}{row['meanCpuSeconds']:>15.3f}"
            f"{row['meanStabilityPct']:>15.1f}{row['uncovered']:>12}"
        )
    print("\n💾 Guardado en data/cache/benchmarks/algorithms_latest.json")


if __name__ == "__main__":
    main()
