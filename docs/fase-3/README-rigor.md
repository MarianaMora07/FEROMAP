# Fase 3 — Rigor algorítmico (tesis)

**Estado:** completado  
**Fecha:** 2026-08-27

Documentación y evidencia experimental para fortalecer el capítulo de implementación y resultados.

## Entregables

| ID | Entregable | Ubicación |
|----|------------|-----------|
| 3.1 | Límites del solver | [limites-solver.md](./limites-solver.md) |
| 3.1 | Matriz UI ↔ motor (actualizada) | [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md) |
| 3.2 | Benchmark 5×3 perfiles | [evidencia-aco.md](./evidencia-aco.md) |
| 3.3 | Sensibilidad ACO (hormigas, iteraciones y α/β/ρ/Q) | [evidencia-aco.md](./evidencia-aco.md) + UI en `/optimization` |
| 3.4 | Acciones sobre puntos no cubiertos | `UncoveredPointsActionsPanel` + API `defer-uncovered` |
| 3.5 | Regresión pre-defensa | `just defense-verify` ampliado |

## Comandos reproducibles

```bash
# Benchmark completo (5 escenarios × 3 perfiles: rápido, estándar, exhaustivo)
just benchmark-aco

# Sensibilidad (hormigas 8/12/20, iteraciones 10/20/40 y α/β/ρ/Q en 3 niveles, escenario normal)
just phase3-sensitivity

# Reporte markdown para capítulo/memo
just phase3-report

# Verificación pre-defensa (optimize → KPIs → playback → dispatch)
just defense-verify
```

## Justificación del perfil estándar 12×20

El perfil **estándar** (12 hormigas × 20 iteraciones) se eligió porque:

1. **Benchmark:** CPU aceptable en los 5 escenarios operativos vs perfil preciso (20×40).
2. **Sensibilidad:** punto medio entre calidad de distancia y tiempo de cómputo.
3. **Early stop:** el motor puede detenerse antes por criterio de paciencia (`acoPatience`).
4. **Demo en vivo:** ~8–12 s por corrida con grafo en caché (entorno dev).

Ver tablas numéricas en [evidencia-aco.md](./evidencia-aco.md).

## Fase 3 anterior (honestidad de variables)

La fase 3 original (2026-08-08) cubrió honestidad de variables UI. Ver decisiones en el [README histórico](./README-variables.md) si aplica.

## Decisiones de alcance del objetivo (multiobjetivo, Fase 13)

Fijadas **antes** de calibrar parámetros, para que el barrido sea interpretable y
reproducible. No se asumen: cada una se tomó explícitamente y tiene consecuencias.

| ID | Decisión | Motivo | Consecuencia práctica |
|----|----------|--------|-----------------------|
| D1 | El rebose es **KPI**, no objetivo (`overflow_penalty_weight = 0`) | El deadline del rebose se mide desde "ahora" (`hours_until_overflow`) y las llegadas desde la salida de la flota (`_route_timeline`): bases distintas → no reproducible. Además `objective_active` (`_aco_cvrp`) no incluye el rebose, así que con `w_ov` como único peso no corre el local search. | Se reporta rebose proyectado en kg (`kpis["overflowKg"]`, `kpis["overflowKgAvoided"]`). Activar el peso exige antes (a) alinear el reloj y (b) sumar el rebose a `objective_active`. |
| D2 | Métrica primaria del barrido: **distancia optimizada** | Es el KPI histórico, comparable entre corridas, y con el que AC-1 ya tolera hasta 15 % de aumento. | Makespan/horas de ruta y rebose (kg) actúan como **guardarraíles**, no como objetivo. Coincide con los ejes de `build_pareto_frontier`. |
| D3a | `fill_threshold_pct` (admin): **no conectar** por ahora; corregir el doc | `resolve_critical_threshold` no lo llama nadie; conectarlo mueve el baseline de calibración (80 → configurable). | Se corrigió `matriz-variables-motor.md` a "Pendiente". Conectarlo (si se decide) debe empezar por catálogo/KPI, **sin tocar el ACO**. |
| D3b | `min_active_vehicles` se mantiene como **barrera** (cota inferior), no como perilla | La barrera garantiza la flota mínima; un peso normalizado la convierte en compromiso y pierde la garantía. | Si se quiere eje de flota para la tesis, debe ser un término normalizado **aparte**, no reutilizar `min_active_vehicles`. |
| D3c | Partición sectorial: **guard + doc**, sin unificar | El camino sectorial no reenvía λ_b/λ_t/min. vehículos ni corre el local search: su objetivo no es el global. | `run_optimization_engine` avisa y marca `simulationParameters.multiObjective.objectiveDegradedBySectorPartition`. **No calibrar cruzando esa frontera.** |

Caveats al calibrar:

- **Construcción mixta:** con el objetivo activo, la mitad de la colonia
  (`ant_seed % 2 == 0`) usa el constructor balanceado y la otra el secuencial. Es diseño
  de búsqueda, no del objetivo; hay que declararlo al barrer `aco_ants`.
- **Frontera sectorial:** no comparar corridas con y sin partición sectorial forzada
  (ver D3c).
- **Valor absoluto del rebose:** el deadline se mide desde "ahora", así que los kg
  absolutos cambian según cuándo se corre; la comparación `current` vs `optimized`
  dentro de una misma corrida sí es válida.

Reproducibilidad del barrido: `run_optimization_engine` acepta y expone `seed`
(job + API `POST /simulations/optimize`); la partición sectorial deriva la semilla
por vehículo (`base + v_idx * 17`).

## Archivos clave

- `backend/app/services/benchmark_service.py`
- `backend/app/services/aco_sensitivity_service.py`
- `backend/scripts/generate_phase3_report.py`
- `src/features/optimization/OptimizationAcoSensitivityPanel.tsx`
- `src/features/landfill/UncoveredPointsActionsPanel.tsx`
- `scripts/defense-verify.sh`
