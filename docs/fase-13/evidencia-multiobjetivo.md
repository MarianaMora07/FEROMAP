# Evidencia — Motor de optimización multiobjetivo (Fase 13)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-09-15 · **re-medido el 2026-09-18** sobre la instancia vigente |
| **Fase** | 13 — Optimización multiobjetivo (implementa 13.1–13.5 de la [especificación](./especificacion-motor-multiobjetivo.md)) |
| **Instancia** | Demo (**180 puntos**, **10 vehículos**, **8 asignables** con conductor, jornada base 12 h) |
| **Determinismo** | `seed=42`, escenario `normal` |
| **Evidencia** | Barrido de 17 pesos `calibration_sweeps` **id 18** (271,2 s, sello `fresh`) · réplica de las candidatas `method`/C7 **id 20** — tablas en [evidencia-calibracion-metodologica.md](./evidencia-calibracion-metodologica.md) §9 |

## 1. Qué se implementó

| Fase | Entregable |
|------|------------|
| 13.1 | Métricas **por ruta** en `_solution_operational_metrics` + KPIs aditivos: `activeVehicles`, `fleetUtilizationPct`, `vehicleWorkloadHours`, `maxRouteHours`, `shiftSlackHours`, `finishUnderTargetPct`, `workloadStdHours`, `fairnessIndex` |
| 13.2 | Objetivo combinado en la aptitud (`_objective_cost`) + construcción balanceada (`_build_balanced_ant_solution`) + local search inter-ruta (`_rebalance_pass`) |
| 13.3 | Restricción `min_active_vehicles` con degradación por warning si es infactible |
| 13.4 | Rotación de flota semanal (`weekly_fleet_rotation`) + KPIs de horizonte |
| 13.5 | Persistencia de `RouteWaypoint.estimated_arrival_at` (ETA) en la zona horaria operativa (`America/Caracas`) |
| 13.7 | UI: panel de pesos (deslizadores acotados a 0–3) y jornada de turno en el panel del día; insignias de flota/equidad/duración; y los parámetros del motor (bloque **Uso de flota** con λ_b/λ_t, mín. camiones activos, jornada de turno por defecto y rotación semanal) en la página **Configuración → Algoritmo** (`/settings`) |

### Decisiones de política confirmadas

| Tema | Decisión | Motivo |
|------|----------|--------|
| Cómo repartir más la carga | **Jornada de turno por defecto** (`defaultShiftHours`) + mínimo de camiones activos + pesos de equidad/makespan, en el bloque **«Uso de flota»** | El nº de camiones lo fija la jornada y la demanda: con turnos de 12 h la misma carga cabe en menos camiones que con 8 h (medido en la instancia vigente: 12 h→**6**, 8 h→**8** camiones, y aun así la jornada de 8 h deja puntos sin cubrir). El panel ahora expone el mando que sí reparte. |
| Rango de los pesos | **Backend `[0, 10]`** (contrato §9); **UI acotada a 0–3** | Política conservadora: con la instancia vigente el barrido no rompe AC-1 hasta `w = 5` (ratio máximo 1,099), así que el tope evita el compromiso extremo sin recortar el contrato del motor. |
| Territorios sector→conductor | Con el objetivo activo se usa **reparto global** (avisando); solo se respeta si el llamador fuerza `sector_partition=True` (entonces se avisa que el objetivo no aplica) | La equidad y el makespan son métricas de flota: en partición son degeneradas o dejarían puntos sin cubrir (R-4). |
| Zona horaria de la ETA | **`America/Caracas`** (config operativa, con respaldo UTC si el valor es inválido) | Es la zona que usa el sistema; anclar en UTC mostraba la salida a las 02:00 locales. El reloj operativo quedó unificado (`backend/app/domain/operational_clock.py`) en el motor (ETA), el seed de demo del playback (06:15 local) y el respaldo del playback (06:00 local). |
| 13.6 puntualidad | **No implementada** | Las ventanas son restricción dura: el cumplimiento ya es 100 % por construcción. Darle sentido al KPI exige *ablandar* la ventana (permitir llegar tarde y penalizar), lo que cambia el comportamiento del solver y debilita la garantía actual. |

## 2. Modelo y decisiones de diseño

Objetivo (Fase 13, §4), con los tres términos normalizados:

```
min   w_d · (D / D_ref)              # eficiencia (D_ref = distancia baseline)
    + w_b · (σ_horas / μ_horas)      # equidad de carga
    + w_t · (T_max / H_jornada)      # makespan
    + 10 · max(0, min_active − activos)   # barrera de la restricción de flota
```

- **Compatibilidad (RNF-2)**: con `w_b = w_t = 0` y sin `min_active_vehicles` la
  construcción secuencial original no se toca y la función de costo devuelve
  `distancia + rebose`: rutas y KPIs idénticos a la versión previa.
- **Construcción balanceada (D2)**: la construcción secuencial llena el primer camión
  a tope y deja el resto ocioso. La balanceada **abre el mínimo de camiones necesario**
  (según jornada, incluyendo el regreso al depósito) y reparte las paradas al camión
  **menos cargado** ya abierto; el cliente lo sigue eligiendo la feromona.
- **Diversidad de hormigas**: con pesos activos la mitad de las hormigas usa la
  construcción balanceada (extremo de servicio) y la otra mitad la secuencial (extremo
  de distancia). Los pesos seleccionan el compromiso de Pareto.
- **Local search inter-ruta (D3)**: `_rebalance_pass` mueve paradas de la ruta más
  cargada a la más liviana mientras el costo combinado baje y se respeten capacidad y
  jornada (no se aplica con ventanas horarias).
- **Territorios (R-4/RNF-6)**: con partición sector→conductor cada vehículo resuelve su
  zona; el objetivo multiobjetivo no aplica y el motor lo reporta con un *warning*.

## 3. Barrido de pesos (`just phase13-sweep`)

17 corridas sobre la instancia demo (271,2 s con `seed=42`; `calibration_sweeps` id 18).

| Caso | Jornada | w_b | w_t | mín. veh. | Dist. km | Veh. activos | máx. h | holgura h | ≤ objetivo % | σ h | equidad | no cubiertos | s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base 8 h (w=0) | 8 | 0.00 | 0.00 | — | 165.70 | 8 | 7.96 | 4.04 | 100.00 | 0.07 | 0.99 | 8 | 3.49 |
| equidad 0.5 | 8 | 0.50 | 0.00 | — | 165.70 | 8 | 7.96 | 4.04 | 100.00 | 0.07 | 0.99 | 8 | 3.32 |
| equidad 1 | 8 | 1.00 | 0.00 | — | 165.70 | 8 | 7.96 | 4.04 | 100.00 | 0.07 | 0.99 | 8 | 3.33 |
| equidad 2 | 8 | 2.00 | 0.00 | — | 165.70 | 8 | 7.96 | 4.04 | 100.00 | 0.07 | 0.99 | 8 | 3.34 |
| equidad 5 | 8 | 5.00 | 0.00 | — | 165.70 | 8 | 7.96 | 4.04 | 100.00 | 0.07 | 0.99 | 8 | 3.13 |
| makespan 0.5 | 8 | 0.00 | 0.50 | — | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.59 |
| makespan 1 | 8 | 0.00 | 1.00 | — | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.57 |
| makespan 2 | 8 | 0.00 | 2.00 | — | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.42 |
| makespan 5 | 8 | 0.00 | 5.00 | — | 174.60 | 8 | 7.87 | 4.13 | 100.00 | 0.09 | 0.99 | 10 | 4.53 |
| equidad 1 + makespan 2 | 8 | 1.00 | 2.00 | — | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.78 |
| equidad 2 + makespan 2 | 8 | 2.00 | 2.00 | — | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.56 |
| mín. 6 vehículos | 8 | 0.00 | 0.00 | 6 | 166.00 | 8 | 7.91 | 4.09 | 100.00 | 0.10 | 0.99 | 8 | 3.61 |
| base 12 h (w=0) | — | 0.00 | 0.00 | — | 194.20 | 6 | 11.81 | 0.19 | 0.00 | 1.33 | 0.88 | 0 | 3.61 |
| 12 h · makespan 2 | — | 0.00 | 2.00 | — | 187.40 | 6 | 11.28 | 0.72 | 0.00 | 0.10 | 0.99 | 0 | 4.06 |
| 12 h · equidad 2 | — | 2.00 | 0.00 | — | 198.60 | 6 | 11.35 | 0.65 | 0.00 | 0.12 | 0.99 | 0 | 3.41 |
| 12 h · equidad 2 + makespan 2 | — | 2.00 | 2.00 | — | 213.50 | 6 | 11.36 | 0.64 | 0.00 | 0.12 | 0.99 | 0 | 3.70 |
| 12 h · mín. 4 vehículos | — | 0.00 | 0.00 | 4 | 196.90 | 6 | 11.86 | 0.14 | 0.00 | 1.32 | 0.88 | 0 | 3.91 |

**Lectura (instancia vigente).** El resultado cambió de signo respecto a la medición de 2026-09-15, y el motivo es la instancia: con **180 puntos** la jornada de **8 h es infactible** — los 12 puntos del bloque dejan **8–10 puntos sin cubrir** —, así que la fila que «cumple» el objetivo lo hace a costa de no visitar todo. En el bloque de 8 h los pesos apenas mueven nada: `equidad` (0,5 a 5) deja la corrida **idéntica** a la base (165,70 km · 8 veh · 7,96 h · 8 sin cubrir), `makespan` 0,5/1/2 comparten 166,00 km · 7,91 h, y solo `makespan 5` se desvía (+8,9 km y 10 sin cubrir). En el bloque de 12 h — el único **factible** (0 sin cubrir) — sí hay compromiso: 194,20 km base → 187,40 km con `makespan 2` → 198,60 km con `equidad 2` → 213,50 km apilando ambos, con la flota fija en 6 camiones. La frontera de Pareto (distancia ↓, makespan ↓, flota ↑) queda con **una** solución: `12 h · makespan 2` (187,40 km · 6 veh. · 11,28 h).

> La réplica con las 10 semillas del protocolo (C7, id 20) confirma que la lectura no es un artefacto de una semilla: las medianas del bloque de 8 h son 163,85 km (base), 164,85 km (`makespan 0.5`) y 170,35 km (`makespan 5`), con AC-2 sin candidatos.

## 4. Criterios de aceptación (Fase 13, §8)

| Criterio | Resultado |
|---|---|
| **AC-1** `distanceKm.optimized ≤ 1.15 × distanceKm.optimized(w=0)` | ⚠️ **Las 15 filas con pesos cumplen la tolerancia** (ratio máximo **1,099**: `12 h · equidad 2 + makespan 2`; el bloque de 8 h se queda en 1,000–1,054), **pero el criterio no se puede cerrar**: AC-1 se evalúa en el «punto de operación aceptado» y ese punto lo define AC-2, que no tiene candidatos. En la instancia vigente la jornada de 8 h deja 8–10 puntos sin cubrir, así que no existe el punto aceptado y `ac1.ok` queda en falso por construcción. |
| **AC-2** `activeVehicles ≥ 3` **y** `maxRouteHours ≤ 8 h` | ❌ **FALLA**: 0 candidatos. Ninguna fila del bloque de 8 h deja 0 puntos sin cubrir (mínimo 8), de modo que cumplir la jornada de 8 h cuesta servicio no visitado. En la medición de 2026-09-15 sobre 120 puntos el bloque era factible (11 candidatos); con 180 puntos ya no lo es. La jornada de 12 h sí cubre todo (0 sin cubrir) con 6 vehículos. |
| **AC-3** `distinctVehiclesWeek ≥ 6` de 8 y `usageStdDays ≤ 1` | ✅ verificado con el motor real en una semana demo (`just phase13-weekly`, 2026-09-18): `distinctVehiclesWeek=8`, `vehicleDaysUsed=30`, `usageStdDays=0,43`, `rotationIndex=0,88`. |

## 5. Verificación automatizada

```
podman exec feromap-api pytest tests/test_fase13_multiobjective.py -v
podman exec feromap-api pytest tests/ -q        # just test
npm test                                        # vitest (incluye la UI del objetivo)
```

Casos backend (`tests/test_fase13_multiobjective.py`, 24 casos): métricas por ruta exactas,
KPIs de flota/makespan/holgura, monotonía de la equidad con `w_b`, makespan, restricción
`min_active_vehicles` (factible e infactible), **RNF-2** (línea base caracterizada),
rotación semanal y KPIs de horizonte, persistencia de ETA con zona horaria, política de
territorios y contrato del flujo diario.

Casos frontend (`src/features/optimization/optimizationObjectiveUx.test.ts`): acotado de los
pesos a `[0, 3]`, jornada objetivo, normalización de la preferencia persistida y descripción
del nivel de servicio.

## 6. Limitaciones conocidas

- **Territorios sector→conductor**: con el objetivo activo el motor usa reparto global (avisando) para
  que la equidad y el makespan tengan sentido; si se fuerza la partición, cada vehículo resuelve su
  zona y el objetivo multiobjetivo no aplica (R-4).
- `_rebalance_pass` no se aplica cuando hay **ventanas horarias** activas.
- La **ETA** se ancla a la hora de inicio de jornada de la instalación (`work_start`) sobre la fecha de
  operación, en la **zona horaria operativa** (`America/Caracas`); se persiste como `timestamptz`, así
  que el valor absoluto es correcto y la conversión a hora local la hace el cliente. El mismo reloj
  operativo lo usan el seed de demo del playback y su respaldo (antes anclaban en UTC).
- El **ancla de demo TR-01** se desactiva sola cuando la rotación deja descansar a TR-01
  (no está en la flota del día), evitando sesgar el reparto (D4).
- **Rango de pesos**: la UI ofrece 0–3; el contrato del backend acepta `[0, 10]`. Con la instancia
  vigente el barrido mide ratios de AC-1 ≤ 1,054 en el bloque de 8 h y ≤ 1,099 en el de 12 h hasta
  `w = 5`, así que el tope de 0–3 es una **política conservadora**, no el punto donde se rompe la
  tolerancia (en la instancia anterior de 120 puntos sí se rompía a `w_b = 5`).
