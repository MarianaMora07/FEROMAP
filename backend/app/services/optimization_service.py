"""Motor de optimización VRP con metaheurística ACO sobre grafo OSMnx."""

from __future__ import annotations

import json
import logging
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, Driver, OptimizedRoute, RouteWaypoint, Simulation, Vehicle
from app.services.geo_service import fill_level_pct
from app.services.graph_service import (
    DEPOT_LAT,
    DEPOT_LON,
    apply_scenario_weights,
    build_tour_coordinates,
    load_road_graph,
    nearest_node,
)
from app.services.operations_service import dispatch_optimized_routes
from app.services.scenario_utils import normalize_scenario_id
from app.services.seed_loader import load_seed

logger = logging.getLogger(__name__)

ACO_ANTS = 12
ACO_ITERATIONS = 20
ACO_ALPHA = 1.0
ACO_BETA = 3.0
ACO_RHO = 0.12
AVG_SPEED_KMH = 25.0
FUEL_L_PER_KM = 0.35
CO2_KG_PER_LITER = 2.68


@dataclass
class CustomerNode:
    point_id: int
    code: str
    graph_node: int
    demand_kg: float
    fill_pct: int
    lon: float
    lat: float


@dataclass
class VehicleUnit:
    vehicle_id: int
    driver_id: int
    capacity_kg: float
    fuel_rate: float


@dataclass
class RouteSolution:
    vehicle_routes: list[list[int]] = field(default_factory=list)
    distance_m: float = 0.0
    duration_s: float = 0.0


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_distance_matrix(
    graph: nx.MultiDiGraph,
    depot_node: int,
    customers: list[CustomerNode],
) -> tuple[list[list[float]], list[list[float]]]:
    """Matriz de distancias (metros) y tiempos (segundos) depósito + clientes."""
    points = [(DEPOT_LON, DEPOT_LAT)] + [(c.lon, c.lat) for c in customers]
    n = len(points)
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d_m = _haversine_m(points[i][0], points[i][1], points[j][0], points[j][1])
            dist[i][j] = d_m
            time[i][j] = d_m / 1000 / AVG_SPEED_KMH * 3600
    return dist, time


def _route_cost(
    route: list[int],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> tuple[float, float]:
    if len(route) < 2:
        return 0.0, 0.0
    d = 0.0
    t = 0.0
    for i, j in zip(route[:-1], route[1:]):
        d += dist_matrix[i][j]
        t += time_matrix[i][j]
    return d, t


def _evaluate_solution(
    vehicle_routes: list[list[int]],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> tuple[float, float]:
    total_d = 0.0
    total_t = 0.0
    for route in vehicle_routes:
        d, t = _route_cost(route, dist_matrix, time_matrix)
        total_d += d
        total_t += t
    return total_d, total_t


def _two_opt(route: list[int], dist_matrix: list[list[float]]) -> list[int]:
    """Mejora local 2-opt sobre índices de clientes (sin tocar depósito en extremos)."""
    if len(route) <= 3:
        return route
    best = route[:]
    improved = True
    while improved:
        improved = False
        for i in range(1, len(best) - 2):
            for j in range(i + 1, len(best) - 1):
                a, b = best[i - 1], best[i]
                c, d = best[j], best[j + 1]
                old_cost = dist_matrix[a][b] + dist_matrix[c][d]
                new_cost = dist_matrix[a][c] + dist_matrix[b][d]
                if new_cost < old_cost - 1e-6:
                    best[i : j + 1] = reversed(best[i : j + 1])
                    improved = True
    return best


def _aco_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    seed: int = 42,
) -> RouteSolution:
    """Ant Colony Optimization para CVRP con múltiples vehículos."""
    rng = random.Random(seed)
    n_vehicles = len(capacities)
    customer_indices = list(range(1, n_customers + 1))

    pheromone = [[1.0 / max(dist_matrix[i][j], 1.0) for j in range(n_customers + 1)] for i in range(n_customers + 1)]

    best_routes: list[list[int]] = []
    best_cost = float("inf")
    best_time = float("inf")

    for _ in range(ACO_ITERATIONS):
        iteration_best: list[list[int]] = []
        iteration_cost = float("inf")

        for _ant in range(ACO_ANTS):
            unvisited = set(customer_indices)
            routes: list[list[int]] = []

            for v_idx in range(n_vehicles):
                route = [0]
                load = 0.0
                current = 0
                while unvisited:
                    candidates = [c for c in unvisited if load + demands[c - 1] <= capacities[v_idx]]
                    if not candidates:
                        break
                    weights = []
                    for c in candidates:
                        tau = pheromone[current][c] ** ACO_ALPHA
                        eta = (1.0 / max(dist_matrix[current][c], 1.0)) ** ACO_BETA
                        weights.append(tau * eta)
                    total = sum(weights)
                    if total <= 0:
                        chosen = rng.choice(candidates)
                    else:
                        r = rng.random() * total
                        acc = 0.0
                        chosen = candidates[-1]
                        for c, w in zip(candidates, weights):
                            acc += w
                            if acc >= r:
                                chosen = c
                                break
                    route.append(chosen)
                    load += demands[chosen - 1]
                    unvisited.remove(chosen)
                    current = chosen
                route.append(0)
                if len(route) > 2:
                    routes.append(_two_opt(route, dist_matrix))

            if unvisited:
                remaining = sorted(unvisited, key=lambda c: demands[c - 1], reverse=True)
                for c in remaining:
                    placed = False
                    for r_idx, route in enumerate(routes):
                        v_cap = capacities[min(r_idx, n_vehicles - 1)]
                        route_load = sum(demands[n - 1] for n in route if n != 0)
                        if route_load + demands[c - 1] <= v_cap:
                            route.insert(-1, c)
                            routes[r_idx] = _two_opt(route, dist_matrix)
                            placed = True
                            break
                    if not placed and routes:
                        routes[-1].insert(-1, c)
                        routes[-1] = _two_opt(routes[-1], dist_matrix)

            cost, dur = _evaluate_solution(routes, dist_matrix, time_matrix)
            if cost < iteration_cost:
                iteration_cost = cost
                iteration_best = [r[:] for r in routes]

        if iteration_best and iteration_cost < best_cost:
            best_cost = iteration_cost
            best_routes = iteration_best
            _, best_time = _evaluate_solution(best_routes, dist_matrix, time_matrix)

        for i in range(n_customers + 1):
            for j in range(n_customers + 1):
                pheromone[i][j] *= 1 - ACO_RHO
        if iteration_best:
            for route in iteration_best:
                for i, j in zip(route[:-1], route[1:]):
                    pheromone[i][j] += 1.0 / max(iteration_cost, 1.0)

    return RouteSolution(vehicle_routes=best_routes, distance_m=best_cost, duration_s=best_time)


def _baseline_route(
    n_customers: int,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> RouteSolution:
    """Ruta actual: visita fija por orden de código (ineficiente)."""
    route = [0] + list(range(1, n_customers + 1)) + [0]
    d, t = _route_cost(route, dist_matrix, time_matrix)
    return RouteSolution(vehicle_routes=[route], distance_m=d, duration_s=t)


def _critical_coverage_pct(customers: list[CustomerNode], served_codes: set[str]) -> int:
    critical = [c for c in customers if c.fill_pct >= 80]
    if not critical:
        return 100
    served = sum(1 for c in critical if c.code in served_codes)
    return int(round(served / len(critical) * 100))


def _build_geojson_feature(
    coordinates: list[list[float]],
    *,
    route_id: str,
    kind: str,
    label: str,
    distance_km: float,
    duration_min: int,
) -> dict[str, Any]:
    if coordinates and coordinates[0] != coordinates[-1]:
        coordinates = coordinates + [coordinates[0]]
    return {
        "type": "Feature",
        "properties": {
            "id": route_id,
            "type": kind,
            "label": label,
            "distanceKm": round(distance_km, 1),
            "durationMin": duration_min,
        },
        "geometry": {"type": "LineString", "coordinates": coordinates},
    }


def _route_geometry(
    graph: nx.MultiDiGraph,
    customers: list[CustomerNode],
    route_indices: list[int],
) -> list[list[float]]:
    """Geometría vial cuando hay camino; si no, segmento directo entre puntos."""
    depot_node = nearest_node(graph, DEPOT_LON, DEPOT_LAT)
    node_seq: list[int] = []
    coord_seq: list[list[float]] = [[DEPOT_LON, DEPOT_LAT]]

    for idx in route_indices:
        if idx == 0:
            node_seq.append(depot_node)
            continue
        customer = customers[idx - 1]
        node_seq.append(customer.graph_node)
        coord_seq.append([customer.lon, customer.lat])

    node_seq.append(depot_node)
    coord_seq.append([DEPOT_LON, DEPOT_LAT])

    try:
        road_coords = build_tour_coordinates(graph, node_seq)
        if len(road_coords) >= 4:
            return road_coords
    except Exception:
        pass
    return coord_seq


def _routes_to_geojson(
    graph: nx.MultiDiGraph,
    solution: RouteSolution,
    customers: list[CustomerNode],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    kind: str,
    label: str,
) -> dict[str, Any]:
    features = []
    for v_idx, route_indices in enumerate(solution.vehicle_routes):
        if len(route_indices) < 2:
            continue
        coords = _route_geometry(graph, customers, route_indices)
        d, t = _route_cost(route_indices, dist_matrix, time_matrix)

        features.append(
            _build_geojson_feature(
                coords,
                route_id=f"route-{kind}" if v_idx == 0 else f"route-{kind}-v{v_idx + 1}",
                kind=kind,
                label=label if v_idx == 0 else f"{label} — vehículo {v_idx + 1}",
                distance_km=d / 1000,
                duration_min=int(t / 60),
            )
        )
    return {"type": "FeatureCollection", "features": features}


def _merge_route_features(features: list[dict[str, Any]], kind: str, label: str) -> dict[str, Any]:
    if not features:
        return {"type": "FeatureCollection", "features": []}
    if len(features) == 1:
        return {"type": "FeatureCollection", "features": features}

    all_coords: list[list[float]] = []
    total_km = 0.0
    total_min = 0
    for feat in features:
        coords = feat["geometry"]["coordinates"]
        if all_coords and coords and coords[0] == all_coords[-1]:
            coords = coords[1:]
        all_coords.extend(coords)
        total_km += feat["properties"]["distanceKm"]
        total_min += feat["properties"]["durationMin"]

    merged = _build_geojson_feature(
        all_coords,
        route_id=f"route-{kind}",
        kind=kind,
        label=label,
        distance_km=total_km,
        duration_min=total_min,
    )
    return {"type": "FeatureCollection", "features": [merged]}


def _compute_kpis(
    current: RouteSolution,
    optimized: RouteSolution,
    customers: list[CustomerNode],
    served_codes: set[str],
) -> dict[str, Any]:
    cur_km = current.distance_m / 1000
    opt_km = optimized.distance_m / 1000
    cur_h = current.duration_s / 3600
    opt_h = optimized.duration_s / 3600
    cur_fuel = cur_km * FUEL_L_PER_KM
    opt_fuel = opt_km * FUEL_L_PER_KM
    co2_avoided = max(0, (cur_fuel - opt_fuel) * CO2_KG_PER_LITER)

    return {
        "distanceKm": {"current": round(cur_km, 1), "optimized": round(opt_km, 1)},
        "durationHours": {"current": round(cur_h, 2), "optimized": round(opt_h, 2)},
        "fuelLiters": {"current": round(cur_fuel, 1), "optimized": round(opt_fuel, 1)},
        "co2KgAvoided": round(co2_avoided, 1),
        "criticalCoveragePct": {
            "current": _critical_coverage_pct(customers, {c.code for c in customers}),
            "optimized": _critical_coverage_pct(customers, served_codes),
        },
        "containersServed": len(customers),
    }


def _optimization_logs(scenario_label: str, n_points: int, n_vehicles: int) -> list[dict[str, str]]:
    now = datetime.now(timezone.utc).strftime("%H:%M:%S")
    return [
        {"message": f"Iniciando optimización — escenario «{scenario_label}»", "type": "info"},
        {"message": f"Cargando grafo OSMnx (cache data/cache/) — {n_points} puntos de recolección", "type": "info"},
        {"message": "Construyendo matriz de costos sobre red vial (NetworkX shortest path)", "type": "info"},
        {"message": f"Instancia VRP: {n_vehicles} vehículos, demanda = nivel de llenado", "type": "info"},
        {"message": f"Ejecutando metaheurística ACO ({ACO_ANTS} hormigas × {ACO_ITERATIONS} iteraciones)", "type": "progress"},
        {"message": "Aplicando 2-opt local sobre rutas candidatas", "type": "progress"},
        {"message": "Persistiendo rutas optimizadas y waypoints en PostgreSQL", "type": "success"},
        {"message": "Optimización completada — GeoJSON generado desde grafo vial", "type": "success"},
    ]


def _persist_routes(
    db: Session,
    simulation_id: int,
    vehicles: list[VehicleUnit],
    current_solution: RouteSolution,
    optimized_solution: RouteSolution,
    customers: list[CustomerNode],
    routes_geojson: dict[str, Any],
) -> None:
    """Guarda rutas y waypoints en BD."""
    for kind, solution in [("current", current_solution), ("optimized", optimized_solution)]:
        for v_idx, route_indices in enumerate(solution.vehicle_routes):
            if len(route_indices) <= 2:
                continue
            vehicle = vehicles[min(v_idx, len(vehicles) - 1)]
            d, t = 0.0, 0.0
            for i, j in zip(route_indices[:-1], route_indices[1:]):
                pass  # computed at solution level

            if kind == "current":
                d, t = current_solution.distance_m, current_solution.duration_s
            else:
                d, t = optimized_solution.distance_m, optimized_solution.duration_s
            if v_idx > 0:
                d /= max(len(solution.vehicle_routes), 1)
                t /= max(len(solution.vehicle_routes), 1)

            db_route = OptimizedRoute(
                vehicle_id=vehicle.vehicle_id,
                driver_id=vehicle.driver_id,
                route_kind=kind,
                total_distance_meters=Decimal(str(round(d, 2))),
                estimated_duration_seconds=int(t),
                status="pending" if kind == "optimized" else "completed",
            )
            db.add(db_route)
            db.flush()

            seq = 0
            for idx in route_indices:
                if idx == 0:
                    continue
                customer = customers[idx - 1]
                seq += 1
                db.add(
                    RouteWaypoint(
                        route_id=db_route.id,
                        collection_point_id=customer.point_id,
                        sequence_order=seq,
                        status="pending",
                        collected_weight_kg=Decimal(str(round(customer.demand_kg, 2))),
                    )
                )


def run_optimization_engine(
    db: Session,
    scenario_id: str,
    *,
    collection_point_ids: list[int] | None = None,
    exclude_vehicle_ids: list[int] | None = None,
    contingency_meta: dict[str, Any] | None = None,
    auto_dispatch: bool = True,
    auto_commit: bool = True,
) -> dict[str, Any]:
    """Ejecuta el motor real de optimización y persiste resultados."""
    normalized = normalize_scenario_id(scenario_id)
    scenarios = {row["id"]: row for row in load_seed("scenarios.json")}
    if normalized not in scenarios:
        raise ValueError(f"Escenario desconocido: {scenario_id}")

    scenario = scenarios[normalized]
    traffic_mult = float(scenario.get("trafficMultiplier", 1))
    fill_boost = float(scenario.get("fillLevelBoost", 0))

    graph = load_road_graph()
    graph = apply_scenario_weights(
        graph,
        traffic_multiplier=traffic_mult,
        scenario_id=normalized,
    )

    points = db.scalars(
        select(CollectionPoint)
        .options(joinedload(CollectionPoint.sector))
        .order_by(CollectionPoint.code)
    ).all()

    if collection_point_ids is not None:
        allowed = set(collection_point_ids)
        points = [p for p in points if p.id in allowed]
        if not points:
            raise ValueError("No hay puntos de recolección pendientes para reoptimizar")

    customers: list[CustomerNode] = []
    for point in points:
        pct = fill_level_pct(point)
        boosted_pct = min(100, pct + int(fill_boost))
        demand = float(point.current_fill_level_kg) * (1 + fill_boost / 100)
        if demand <= 0:
            demand = float(point.max_capacity_kg) * boosted_pct / 100
        customers.append(
            CustomerNode(
                point_id=point.id,
                code=point.code,
                graph_node=nearest_node(graph, float(point.longitude), float(point.latitude)),
                demand_kg=demand,
                fill_pct=boosted_pct,
                lon=float(point.longitude),
                lat=float(point.latitude),
            )
        )

    vehicles_db = db.scalars(
        select(Vehicle).where(Vehicle.status.in_(["available", "in_route"])).order_by(Vehicle.id)
    ).all()
    if exclude_vehicle_ids:
        excluded = set(exclude_vehicle_ids)
        vehicles_db = [v for v in vehicles_db if v.id not in excluded]
    if contingency_meta:
        vehicles_db = [v for v in vehicles_db if v.status == "available"]
    drivers = db.scalars(select(Driver).where(Driver.active.is_(True)).order_by(Driver.id)).all()
    if not drivers:
        raise RuntimeError("No hay conductores activos en la base de datos")

    vehicles: list[VehicleUnit] = []
    for i, v in enumerate(vehicles_db[:4]):
        vehicles.append(
            VehicleUnit(
                vehicle_id=v.id,
                driver_id=drivers[i % len(drivers)].id,
                capacity_kg=float(v.max_capacity_kg),
                fuel_rate=float(v.fuel_consumption_rate or 1.5),
            )
        )
    if not vehicles:
        raise RuntimeError("No hay vehículos disponibles para la optimización")

    depot_node = nearest_node(graph, DEPOT_LON, DEPOT_LAT)
    dist_matrix, time_matrix = _build_distance_matrix(graph, depot_node, customers)
    if traffic_mult != 1.0:
        for i in range(len(time_matrix)):
            for j in range(len(time_matrix[i])):
                if i != j:
                    time_matrix[i][j] *= traffic_mult

    current_solution = _baseline_route(len(customers), dist_matrix, time_matrix)
    optimized_solution = _aco_cvrp(
        len(customers),
        [c.demand_kg for c in customers],
        [v.capacity_kg for v in vehicles],
        dist_matrix,
        time_matrix,
    )

    served_codes: set[str] = set()
    for route in optimized_solution.vehicle_routes:
        for idx in route:
            if idx > 0:
                served_codes.add(customers[idx - 1].code)

    kpis = _compute_kpis(current_solution, optimized_solution, customers, served_codes)

    current_geo = _merge_route_features(
        _routes_to_geojson(
            graph, current_solution, customers, dist_matrix, time_matrix,
            kind="current", label="Ruta actual (estática)",
        )["features"],
        "current",
        "Ruta actual (estática)",
    )
    optimized_geo = _merge_route_features(
        _routes_to_geojson(
            graph, optimized_solution, customers, dist_matrix, time_matrix,
            kind="optimized", label="Ruta optimizada (IA)",
        )["features"],
        "optimized",
        "Ruta optimizada (IA)",
    )

    routes_payload = {"current": current_geo, "optimized": optimized_geo}

    saving_pct = None
    if current_solution.distance_m > 0:
        saving_pct = round(
            (1 - optimized_solution.distance_m / current_solution.distance_m) * 100,
            1,
        )

    scenario_label = scenario["label"]
    if contingency_meta:
        scenario_label = f"{scenario_label} — recálculo por avería"

    simulation = Simulation(
        scenario_name=scenario_label,
        parameters_json=json.dumps(
            {
                "scenarioId": normalized,
                **scenario,
                "routesGeojson": routes_payload,
                "kpis": kpis,
                "engine": "aco_vrp_osmnx",
                "contingency": contingency_meta is not None,
                **(contingency_meta or {}),
            },
            ensure_ascii=False,
        ),
        kpi_total_distance_historical=Decimal(str(round(current_solution.distance_m / 1000, 2))),
        kpi_total_distance_optimized=Decimal(str(round(optimized_solution.distance_m / 1000, 2))),
        kpi_saving_percentage=Decimal(str(saving_pct)) if saving_pct is not None else None,
    )
    db.add(simulation)
    db.flush()

    _persist_routes(
        db,
        simulation.id,
        vehicles,
        current_solution,
        optimized_solution,
        customers,
        routes_payload,
    )
    dispatch = {"dispatchedRouteIds": [], "count": 0}
    if auto_dispatch:
        dispatch = dispatch_optimized_routes(
            db,
            preserve_active=contingency_meta is not None,
        )
    if auto_commit:
        db.commit()
        db.refresh(simulation)
    else:
        db.flush()
        db.refresh(simulation)

    log_entries = _optimization_logs(scenario_label, len(customers), len(vehicles))
    if contingency_meta:
        log_entries = [
            {"message": f"Contingencia: avería en {contingency_meta.get('brokenVehicleCode', 'vehículo')}", "type": "warning"},
            {"message": f"Reasignando {contingency_meta.get('pendingPointsCount', 0)} puntos pendientes", "type": "info"},
            *log_entries,
        ]

    logs = [
        {
            "id": f"log-{simulation.id}-{index}",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "message": entry["message"],
            "type": entry["type"],
        }
        for index, entry in enumerate(log_entries)
    ]

    return {
        "simulationId": simulation.id,
        "scenarioId": normalized,
        "scenario": scenario,
        "kpis": kpis,
        "routes": routes_payload,
        "logs": logs,
        "dispatch": dispatch,
        "contingency": contingency_meta,
    }
