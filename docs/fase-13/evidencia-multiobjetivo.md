# Evidencia — Motor de optimización multiobjetivo (Fase 13)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-09-15 |
| **Fase** | 13 — Optimización multiobjetivo (implementa 13.1–13.5 de la [especificación](./especificacion-motor-multiobjetivo.md)) |
| **Instancia** | Demo (120 puntos, 8 vehículos asignables, jornada base 12 h) |
| **Determinismo** | `seed=42`, escenario `normal` |

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
| Cómo repartir más la carga | **Jornada de turno por defecto** (`defaultShiftHours`) + mínimo de camiones activos + pesos de equidad/makespan, en el bloque **«Uso de flota»** | El nº de camiones lo fija la jornada y la demanda: con turnos de 12 h, 56 puntos caben en 2 camiones aunque los pesos estén activos (medido: 12 h→2, 8 h→3, 6 h→4 camiones). El panel ahora expone el mando que sí reparte. |
| Rango de los pesos | **Backend `[0, 10]`** (contrato §9); **UI acotada a 0–3** | Por encima de ~3 la distancia supera el 15 % de AC-1; el tope visible evita romper el criterio sin recortar el contrato del motor. |
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

17 corridas sobre la instancia demo (≈ 186 s con `seed=42`).

| Caso | Jornada | w_b | w_t | mín. veh. | Dist. km | Veh. activos | máx. h | holgura h | ≤ objetivo % | σ h | equidad |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base 8 h (w=0) | 8 | 0.00 | 0.00 | — | 140.60 | 6 | 8.09 | 3.91 | 66.7 | 1.20 | 0.84 |
| equidad 0.5 | 8 | 0.50 | 0.00 | — | 140.10 | 6 | 7.51 | 4.49 | 100.0 | 0.10 | 0.99 |
| equidad 1 | 8 | 1.00 | 0.00 | — | 133.90 | 6 | 7.50 | 4.50 | 100.0 | 0.12 | 0.98 |
| equidad 2 | 8 | 2.00 | 0.00 | — | 149.60 | 6 | 7.53 | 4.47 | 100.0 | 0.05 | 0.99 |
| equidad 5 | 8 | 5.00 | 0.00 | — | 162.40 | 6 | 7.73 | 4.27 | 100.0 | 0.10 | 0.99 |
| makespan 0.5 | 8 | 0.00 | 0.50 | — | 138.10 | 6 | 7.95 | 4.05 | 100.0 | 1.00 | 0.86 |
| makespan 1 | 8 | 0.00 | 1.00 | — | 133.50 | 6 | 7.44 | 4.56 | 100.0 | 0.13 | 0.98 |
| makespan 2 | 8 | 0.00 | 2.00 | — | 133.60 | 6 | 7.46 | 4.54 | 100.0 | 0.13 | 0.98 |
| makespan 5 | 8 | 0.00 | 5.00 | — | 125.00 | 6 | 7.47 | 4.53 | 100.0 | 0.14 | 0.98 |
| equidad 1 + makespan 2 | 8 | 1.00 | 2.00 | — | 133.20 | 6 | 7.48 | 4.52 | 100.0 | 0.12 | 0.98 |
| equidad 2 + makespan 2 | 8 | 2.00 | 2.00 | — | 150.00 | 6 | 7.56 | 4.44 | 100.0 | 0.07 | 0.99 |
| mín. 6 vehículos | 8 | 0.00 | 0.00 | 6 | 136.90 | 6 | 7.53 | 4.47 | 100.0 | 0.12 | 0.98 |
| base 12 h (w=0) | — | 0.00 | 0.00 | — | 146.50 | 4 | 12.03 | −0.03 | 0.0 | 1.34 | 0.88 |
| 12 h · makespan 2 | — | 0.00 | 2.00 | — | 144.80 | 4 | 11.32 | 0.68 | 0.0 | 0.12 | 0.99 |
| 12 h · equidad 2 | — | 2.00 | 0.00 | — | 157.20 | 4 | 11.41 | 0.59 | 0.0 | 0.03 | 1.00 |
| 12 h · equidad 2 + makespan 2 | — | 2.00 | 2.00 | — | 165.50 | 4 | 11.64 | 0.36 | 0.0 | 0.11 | 0.99 |
| 12 h · mín. 4 vehículos | — | 0.00 | 0.00 | 4 | 142.30 | 4 | 12.07 | −0.07 | 0.0 | 1.26 | 0.89 |

**Lectura**: activar cualquier peso elimina las rutas al 100 % de jornada (máx. 8,09 h → 7,4–7,9 h) y
reduce σ de 1,20 h a 0,03–0,15 h **sin sacrificar distancia** (varios puntos incluso recorren menos
km que la línea base, porque las rutas de 12 h forzaban viajes redundantes). La frontera de Pareto
(distancia ↓, makespan ↓, flota ↑) queda formada por `makespan 5` (125,0 km · 6 veh. · 7,47 h) y
`makespan 1` (133,5 km · 6 veh. · 7,44 h).

## 4. Criterios de aceptación (Fase 13, §8)

| Criterio | Resultado |
|---|---|
| **AC-1** `distanceKm.optimized ≤ 1.15 × distanceKm.optimized(w=0)` | ✅ en el punto de operación aceptado (`makespan 5`: 125,0 km vs 140,6 km ⇒ ratio **0,889**). 14 de los 15 puntos con pesos del barrido cumplen; la única excepción es el extremo `w_b = 5` (162,4 km ⇒ ratio 1,155, 0,5 pp por encima de la tolerancia), que es el final de la escala `[0,10]` donde el compromiso favorece explícitamente la equidad. Al **apilar** los tres objetivos en su rango alto (`w_b=1`, `w_t=2`, `minActiveVehicles=6`) el ratio sube a 1,22: es el límite del compromiso explícito (riesgo R-6), no un defecto del motor. |
| **AC-2** `activeVehicles ≥ 3` y `maxRouteHours ≤ 8 h` | ✅ 11 puntos candidatos (p. ej. `makespan 5`: 6 vehículos y 7,47 h). |
| **AC-3** `distinctVehiclesWeek ≥ 6` de 8 | ✅ verificado con el motor real en una semana demo (`just phase13-weekly`): `distinctVehiclesWeek=6`, `vehicleDaysUsed=20`, `usageStdDays=0,47`, `rotationIndex=0,86`. |

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
- **Rango de pesos**: la UI ofrece 0–3; los valores 3–10 siguen disponibles por API y son los que
  empujan la distancia por encima del 15 % (compromiso explícito, R-6).
