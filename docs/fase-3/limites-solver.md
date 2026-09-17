# Límites del solver ACO — FEROMAP

**Fase:** 3 — Rigor algorítmico  
**Fecha:** 2026-08-27

## Qué resuelve el motor

FEROMAP implementa un **CVRP** (Capacitated Vehicle Routing Problem) sobre la red vial real de Unare:

| Capacidad | Detalle |
|-----------|---------|
| **Grafo vial** | OSMnx + NetworkX; distancias y tiempos por calles |
| **Multi-vehículo** | Flota asignable (`available`/`in_route` + conductor); cada vehículo optimiza solo puntos de los sectores de su conductor (`sector.driver_id`); `fleet_limit` es tope opcional |
| **Capacidad** | Carga acumulada por vehículo; demanda según llenado del contenedor |
| **Vertedero multi-viaje** | Descarga obligatoria cuando se supera capacidad |
| **Jornada laboral** | Ventana operativa 06:00–18:00 (12 h) |
| **Escenarios** | Normal, tráfico pico, lluvia, saturación, avería (multiplicadores) |
| **Metaheurística** | ACO + refinamiento 2-opt por ruta |
| **Objetivo del solver** | Objetivo combinado configurable: **distancia** por defecto; Fase 13 añade pesos normalizados de equidad de carga y makespan (0 = solo distancia) |
| **Comparación** | Baseline operativo (orden fijo por código de contenedor) |

## Qué NO resuelve (alcance explícito)

| Limitación | Implicación para la tesis |
|------------|-------------------------|
| **Optimalidad global** | ACO es heurístico; entrega soluciones de alta calidad, no garantía óptima |
| **VRPTW completo** | Sin ventanas operativas por contenedor. Soporte opt-in **VRPTW light** con **ventana por zona** (parroquia), default off → [ADR-006](./adr-006-ventanas-horarias.md) · [ADR-008](./adr-008-ventanas-por-zona.md) |
| **Multiobjetivo** | **Soportado (Fase 13)**: objetivo combinado `w_d·D/D_ref + w_b·(σ_horas/μ_horas) + w_t·(T_max/H_jornada)`, con pesos configurables (`workloadBalanceWeight`, `makespanWeight`), restricción opcional `minActiveVehicles` y rotación de flota semanal. Por defecto los pesos son 0 → comportamiento solo-distancia idéntico al previo (RNF-2). El CO₂ sigue siendo narrativa de KPIs, no término del fitness → [especificación](../fase-13/especificacion-motor-multiobjetivo.md) |
| **OR-Tools / solver exacto** | No en el camino de producción; baseline CP-SAT **opcional** disponible para el benchmark comparativo post-defensa → [ADR-009](./adr-009-baseline-ortools-y-recuperacion.md) |
| **Tráfico en vivo** | Solo multiplicadores estáticos por escenario |
| **Cobertura forzada** | Puede dejar puntos no cubiertos si flota o jornada no alcanzan |
| **GA / SA** | Eliminados del UI operativo; solo ACO en producción |

## Narrativa recomendada ante el jurado

> «El sistema resuelve un CVRP operativo con restricciones reales de la recolección en Unare. La calidad se demuestra con benchmark reproducible, curva de convergencia ACO, comparación baseline vs solución heurística, y análisis de sensibilidad de parámetros — no con la promesa de optimalidad global.»

## Referencias técnicas

- Motor: `backend/app/services/optimization_service.py`
- Objetivo multiobjetivo: `backend/app/services/aco_parallel.py` (`_objective_cost`, `_build_balanced_ant_solution`, `_rebalance_pass`)
- Horquilla de pesos y frontera de Pareto: `just phase13-sweep` → fila del barrido `objective` en la tabla `calibration_sweeps`
- Evidencia Fase 13: [evidencia-multiobjetivo.md](../fase-13/evidencia-multiobjetivo.md)
- ACO paralelo: `backend/app/services/aco_parallel.py`
- Benchmark: `just benchmark-aco` → `data/cache/benchmarks/aco_latest.json`
- Sensibilidad: `just phase3-sensitivity` → fila del barrido `sensitivity` en la tabla `calibration_sweeps` (la BD es la única fuente: [ADR-011](../fase-13/adr-011-calibracion-en-bd.md))
- Evidencia consolidada: [evidencia-aco.md](./evidencia-aco.md)
- Alcance congelado: [alineacion-defensa.md](../fase-0/alineacion-defensa.md)
- Backlog post-grado: [post-grado/README.md](../post-grado/README.md)
