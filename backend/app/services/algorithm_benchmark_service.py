"""Benchmark entre familias de algoritmos (Tarea 6).

Compara ACO (estándar), Clarke-Wright y GA sobre **instancias controladas** del
catálogo (misma generación sintética que los tests unitarios del motor): tamaños
15/30/60 contenedores, semillas fijas y perfiles de escenario. No requiere BD ni
grafo vial: distancia euclidiana × factor de red vial.

Advertencia metodológica: no son rutas históricas; sirven para justificar la
elección de ACO comparando familias sobre el mismo problema.
"""

from __future__ import annotations

import json
import logging
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# (id, factor de tráfico sobre tiempos de viaje)
BENCHMARK_SCENARIOS: list[dict[str, Any]] = [
    {"id": "normal", "label": "Tráfico normal", "trafficFactor": 1.0},
    {"id": "rain", "label": "Lluvia intensa", "trafficFactor": 1.25},
    {"id": "peak_traffic", "label": "Tráfico pico", "trafficFactor": 1.35},
]

INSTANCE_SIZES: list[int] = [15, 30, 60]
INSTANCE_SEEDS: list[int] = [101, 202, 303]

ACO_ANTS = 12
ACO_ITERATIONS = 20
GA_POPULATION = 34
GA_GENERATIONS = 70

FAMILIES = ("aco", "clarke_wright", "genetic")

# Vertedero co-ubicado con el depósito: el ACO modela la descarga final como parte
# de la jornada; así el costo de esa descarga no penaliza a ninguna familia.
_ROAD_FACTOR = 1.3
_SPEED_MPS = 25.0 / 3.6


def _benchmark_dir(*, ensure: bool = False) -> Path:
    path = Path(settings.data_dir) / "cache" / "benchmarks"
    if ensure:
        path.mkdir(parents=True, exist_ok=True)
    return path


def algorithms_cache_path() -> Path:
    return _benchmark_dir() / "algorithms_latest.json"


def load_algorithms_benchmark() -> dict[str, Any] | None:
    path = algorithms_cache_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Benchmark de familias corrupto (%s): %s", path, exc)
        return None


def save_algorithms_benchmark(payload: dict[str, Any]) -> Path:
    path = algorithms_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _build_instance(
    n_customers: int,
    seed: int,
) -> dict[str, Any]:
    """Instancia controlada: coords euclidianas, demanda uniforme, flota con holgura."""
    rng = random.Random(seed)
    depot = (2500.0, 2500.0)
    coords = [(rng.uniform(200, 4800), rng.uniform(200, 4800)) for _ in range(n_customers)]
    demands = [round(rng.uniform(280, 720), 1) for _ in range(n_customers)]
    total = sum(demands)
    # Un solo vehículo con holgura: capacidad > demanda total, sin recarga intermedia.
    # Así las tres familias compiten en un CVRP puro de una ruta (comparación justa).
    vehicles = 1
    capacity = math.ceil(total * 1.1)

    size = n_customers + 2
    dist = [[0.0] * size for _ in range(size)]
    time = [[0.0] * size for _ in range(size)]
    nodes = [depot] + coords + [depot]
    for i in range(size):
        for j in range(size):
            if i == j:
                continue
            dx = nodes[i][0] - nodes[j][0]
            dy = nodes[i][1] - nodes[j][1]
            d = math.hypot(dx, dy) * _ROAD_FACTOR
            dist[i][j] = d
            time[i][j] = d / _SPEED_MPS
    return {
        "n_customers": n_customers,
        "seed": seed,
        "demands": demands,
        "capacities": [float(capacity)] * vehicles,
        "dist": dist,
        "time": time,
        "vehicles": vehicles,
    }


def _route_distance_km(routes: list[list[int]], dist: list[list[float]]) -> float:
    return round(sum(dist[a][b] for route in routes for a, b in zip(route, route[1:])) / 1000.0, 3)


def _run_aco(instance: dict[str, Any], scenario: dict[str, Any], seed: int) -> dict[str, Any]:
    from app.services.optimization_service import _aco_cvrp

    n = instance["n_customers"]
    started = time.perf_counter()
    solution = _aco_cvrp(
        n,
        instance["demands"],
        instance["capacities"],
        instance["dist"],
        instance["time"],
        seed=seed,
        landfill_idx=n + 1,
        shift_budget_sec=1e12,
        unload_sec=0.0,
        service_secs=[0.0] * instance["vehicles"],
        aco_ants=ACO_ANTS,
        aco_iterations=ACO_ITERATIONS,
    )
    cpu = time.perf_counter() - started
    return {
        "routes": [route for route in solution.vehicle_routes if len(route) > 2],
        "uncovered": list(solution.uncovered_customer_indices),
        "cpuSeconds": round(cpu, 4),
    }


def _run_family(instance: dict[str, Any], family: str, seed: int) -> dict[str, Any]:
    from app.domain.vrp_heuristics import clarke_wright_cvrp, genetic_algorithm_cvrp

    n = instance["n_customers"]
    started = time.perf_counter()
    if family == "clarke_wright":
        solution = clarke_wright_cvrp(
            n,
            instance["demands"],
            instance["capacities"],
            instance["dist"],
            instance["time"],
            seed=seed,
        )
    else:
        solution = genetic_algorithm_cvrp(
            n,
            instance["demands"],
            instance["capacities"],
            instance["dist"],
            instance["time"],
            seed=seed,
            population_size=GA_POPULATION,
            generations=GA_GENERATIONS,
        )
    cpu = time.perf_counter() - started
    return {
        "routes": solution.vehicle_routes,
        "uncovered": list(solution.uncovered),
        "cpuSeconds": round(cpu, 4),
    }


def run_algorithms_benchmark() -> dict[str, Any]:
    """Corre familias × escenarios × instancias y persiste el JSON de evidencia."""
    runs: list[dict[str, Any]] = []
    started = datetime.now(timezone.utc)
    clock_started = time.perf_counter()

    for scenario in BENCHMARK_SCENARIOS:
        traffic = float(scenario["trafficFactor"])
        for n_customers in INSTANCE_SIZES:
            for seed in INSTANCE_SEEDS:
                instance = _build_instance(n_customers, seed)
                # Escala solo los tiempos de viaje por escenario; la distancia no cambia.
                time_scaled = [
                    [row_value * traffic for row_value in row] for row in instance["time"]
                ]
                matrix = {**instance, "time": time_scaled}
                for family in FAMILIES:
                    run_seed = seed + n_customers
                    outcome = (
                        _run_aco(matrix, scenario, run_seed)
                        if family == "aco"
                        else _run_family(matrix, family, run_seed)
                    )
                    runs.append(
                        {
                            "scenarioId": scenario["id"],
                            "scenarioLabel": scenario["label"],
                            "instanceSize": n_customers,
                            "seed": seed,
                            "family": family,
                            "familyLabel": {
                                "aco": "ACO (12×20)",
                                "clarke_wright": "Clarke-Wright",
                                "genetic": f"GA ({GA_POPULATION}×{GA_GENERATIONS})",
                            }[family],
                            "distanceKm": _route_distance_km(outcome["routes"], matrix["dist"]),
                            "cpuSeconds": outcome["cpuSeconds"],
                            "uncoveredCount": len(outcome["uncovered"]),
                            "vehicles": matrix["vehicles"],
                            "parameters": {
                                "acoAnts": ACO_ANTS,
                                "acoIterations": ACO_ITERATIONS,
                                "population": GA_POPULATION,
                                "generations": GA_GENERATIONS,
                            },
                        }
                    )

    finished = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "generatedAt": finished.isoformat(),
        "durationSeconds": round(time.perf_counter() - clock_started, 1),
        "methodology": (
            "Instancias controladas del catálogo (coordenadas euclidianas × red vial, "
            "capacidad con holgura, sin vertedero intermedio). No son rutas históricas."
        ),
        "scenarios": [s["id"] for s in BENCHMARK_SCENARIOS],
        "instanceSizes": INSTANCE_SIZES,
        "seeds": INSTANCE_SEEDS,
        "families": list(FAMILIES),
        "runs": runs,
    }
    save_algorithms_benchmark(payload)
    return payload


if __name__ == "__main__":
    payload = run_algorithms_benchmark()
    print(json.dumps({"generatedAt": payload["generatedAt"], "runs": len(payload["runs"])}))
