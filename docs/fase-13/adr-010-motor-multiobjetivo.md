# ADR-010: Motor de optimización multiobjetivo (distancia · uso de flota · tiempo de servicio)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado · **implementado (F13, 2026-09-15)** |
| **Fecha** | 2026-09-15 |
| **Relación** | Continúa [ADR-003 dotación/tiempo de servicio](../fase-8/adr-dotacion-tiempo-servicio.md), [ADR-004 vertedero](../fase-9/adr-vertedero-multi-viaje.md), [ADR-008 ventanas por zona](../fase-3/adr-008-ventanas-por-zona.md); resuelve la limitación "Multiobjetivo" de [limites-solver.md](../fase-3/limites-solver.md). Especificación: [especificacion-motor-multiobjetivo.md](./especificacion-motor-multiobjetivo.md). Evidencia: [evidencia-multiobjetivo.md](./evidencia-multiobjetivo.md). |

## Contexto

El motor ACO resolvía un CVRP **monoobjetivo por distancia**. En la instancia demo eso producía
un efecto indeseado y opaco: la construcción llenaba los camiones **en orden** (`for v in flota`),
así que usaba los dos primeros hasta agotar su jornada y dejaba el resto ocioso. El número de
camiones era un efecto secundario, no una decisión; la jornada quedaba al 100 % y la flota
disponible no se aprovechaba.

La tesis necesita demostrar un **compromiso configurable y medible** entre eficiencia y servicio
(no un número fijo), sin cambiar la metaheurística.

## Decisión

Se mantiene el ACO y se extiende el objetivo. Los tres términos se **normalizan** antes de
ponderarlos para que los pesos sean interpretables e independientes de la escala de la instancia:

```
min   w_d · (D / D_ref)              # eficiencia  (D_ref = distancia baseline de la corrida)
    + w_b · (σ_horas / μ_horas)      # equidad     (coef. de variación de horas por ruta)
    + w_t · (T_max / H_jornada)      # makespan    (ruta más larga / jornada)
    + K   · max(0, min_active − activos)   # barrera de la restricción de flota
```

**D1 — Normalización obligatoria.** Innegociable: sin ella los pesos no son comparables entre
instancias. `w_d` queda fijo en 1 (no se expone); `w_b` y `w_t` son parámetros en `[0, 10]`.

**D2 — Construcción balanceada.** El término de equidad en la aptitud **no basta**, porque la
construcción secuencial concentra la carga por diseño. La construcción balanceada:
- abre **el mínimo de camiones necesario** (no todos), en vez de llenar el primero a tope;
- asigna cada parada al camión **menos cargado** ya abierto (el cliente lo sigue eligiendo la feromona);
- verifica factibilidad **incluyendo el regreso al depósito**, con lo que ninguna ruta supera la jornada
  (esto corrige además un sobrepaso preexistente de ~5 min por el último tramo de vuelta).

**D3 — Diversidad de hormigas.** Con el objetivo activo, la mitad de las hormigas usa la
construcción balanceada (extremo de servicio) y la otra mitad la secuencial (extremo de distancia).
Los pesos **seleccionan** el compromiso de Pareto; sin diversidad el motor saltaría siempre al
mismo extremo y el compromiso no sería graduable.

**D4 — Local search inter-ruta.** `_two_opt` solo reordena dentro de una ruta; la equidad y el
makespan exigen mover paradas **entre** rutas. `_rebalance_pass` mueve paradas de la ruta más
cargada a la más liviana solo si el costo combinado baja y se respetan capacidad y jornada.
No se aplica con ventanas horarias activas.

**D5 — Feromonas.** El depósito usa `pheromone_q / costo`. Al cambiar el costo (de metros a
costo combinado adimensional) la escala cambia; el barrido confirma que la convergencia se mantiene
y que `pheromone_q` no requiere recalibración en el rango probado (los pesos son adimensionales y
el término de distancia queda dividido por `D_ref`).

**D6 — Trazabilidad.** `acoConvergence` reporta distancia (`bestDistanceKm`) **y** costo combinado
(`bestCost`) por separado; `engineMetrics` y `simulationParameters.multiObjective` registran los
pesos efectivos, la referencia de distancia y el mínimo de flota aplicado (RNF-5).

**D7 — Territorios (RNF-6/R-4).** La equidad y el makespan son métricas **de flota**. Con partición
sector→conductor cada vehículo resuelve su zona: la equidad es degenerada (`σ = 0`) y minimizar el
makespan por vehículo dejaría puntos de la zona sin cubrir (no son reasignables). Por tanto:
- si el llamador **no** fuerza `sector_partition`, el objetivo activo usa **reparto global** y se
  reporta un aviso explícito;
- si el llamador fuerza `sector_partition=True`, se respeta el territorio y se emite un **warning**
  de que el objetivo multiobjetivo no aplica.

**D8 — Rango de los pesos.** El contrato de la especificación fija `[0, 10]` y **se conserva** en
API y configuración (es la fuente de verdad). La **UI acota a 3**: por encima de ~2–3 la distancia
crece por encima del 15 % que tolera AC-1, así que el tope visible evita que un clic rompa el
criterio de aceptación sin recortar el contrato del motor.

**D8b — Jornada de turno por defecto (uso de flota).** Se añade `default_shift_hours` a los
parámetros del algoritmo: la corrida manda y, si no especifica jornada, se aplica este valor
(`None` = jornada de la instalación, comportamiento previo). Es el mando que **reparte la carga
entre más vehículos**: a igual demanda, una jornada más corta exige más camiones. Se expone en la
página *Configuración → Algoritmo*, bloque **«Uso de flota»**, aplica también al plan semanal (que
no tenía forma de planificar turnos cortos) y no cambia la salida por defecto (RNF-2).

El panel de *Configuración → Algoritmo* se organiza en bloques: **Uso de flota** (λ_b, λ_t, mín.
camiones activos, jornada de turno por defecto, jornada objetivo del KPI y rotación semanal),
**Motor ACO**, **Heurístico por prioridad de llenado** y **Rebose y calibración**.

**D9 — Rotación de flota semanal.** `generate_weekly_operational_plan` conserva el **tamaño** de
flota de cada día (cuotas por tipo o tope del día) y rota las **identidades**: quedan activos los
vehículos con menos días acumulados y, a igualdad, los que no trabajaron el día anterior.

**D10 — Reloj operativo en zona horaria local.** Las horas de la jornada son horas **locales**
(`America/Caracas`, configurable), no UTC. Se centralizan en `app/domain/operational_clock.py`:
la ETA por parada se ancla a `work_start` de la instalación sobre `operation_date`, el seed de demo
del playback usa 06:15 local (+15 min de desfase) y su respaldo 06:00 local. Antes la ETA no se
persistía y los otros dos puntos anclaban en UTC (la salida de las 06:00 se mostraba a las 02:00
locales). Una zona inválida cae a UTC sin romper la llamada.

**D11 — Ancla de demo.** `_ensure_demo_anchor_vehicle_route` (TR-01) se desactiva sola cuando el
vehículo no está en la flota del día, así que la rotación puede descansarlo sin sesgar el resultado.

## Consecuencias

**Positivas**

- El número de camiones y la jornada pasan de ser efectos secundarios a **variables de decisión**
  configurables, con KPIs verificables (`activeVehicles`, `fairnessIndex`, `maxRouteHours`, …).
- En la instancia demo el servicio sale **gratis o casi**: activar pesos moderados reduce σ de
  1,20 h a ~0,1 h **sin** aumentar la distancia (incluso la baja, porque las rutas de 12 h forzaban
  viajes redundantes).
- RNF-2 garantizado: con `w_b = w_t = 0` y sin `min_active_vehicles` la ruta de código es la previa
  y la salida es **byte-idéntica** (verificado contra el código anterior).

**Negativas / costos asumidos**

- Dos construcciones y un local search adicionales: el costo por corrida sube a ~2,1–3,7 s
  (límite RNF-3: 15 s).
- Los extremos del rango sí pagan distancia (`w_b = 5` ⇒ +15,5 %; los tres objetivos apilados ⇒
  +22 %). Es el compromiso explícito, no un defecto: queda documentado como límite (R-6).
- El compromiso depende de la instancia: `D_ref` es la baseline de la corrida, así que los ratios
  solo son comparables dentro de la misma configuración.

**Neutrales**

- No cambia la narrativa de defensa: el sistema sigue siendo un **CVRP** resuelto con ACO; el CO₂
  sigue siendo reporte, no término del fitness.
- El frontend no consumía ETA antes de F13, así que el cambio de zona horaria no rompe ninguna vista.

## Alternativas consideradas

- **Fijar una cuota de camiones** (p. ej. "usar siempre 4"): rechazada; el número de camiones debe
  emerger de las restricciones y del compromiso, no de una constante.
- **Suma ponderada de metros, horas y camiones sin normalizar**: rechazada (D1); los pesos no serían
  interpretables ni transportables entre instancias.
- **Peso sobre el número de camiones** en el objetivo: rechazada en favor de `min_active_vehicles`
  (restricción dura con degradación) + equidad/makespan, que son continuos y graduables.
- **Equidad intra-zona con territorios**: rechazada en esta fase (requiere varios vehículos por zona
  y reescribir el balanceador de territorios; fuera de alcance).
- **Recortar el rango de pesos a `[0, 3]` en el backend**: rechazada (D8); se acota solo la UI para no
  contradecir el contrato de la especificación.

## Verificación

- Unitarios: `backend/tests/test_fase13_multiobjective.py` (24 casos), incluida la **línea base
  caracterizada** de RNF-2 y los criterios AC-1/AC-2/AC-3.
- Regresión: `just test` (646 passed, 4 skipped) y `just defense-verify`.
- Paramétrico: `just phase13-sweep` (17 corridas, `seed=42`) → `data/cache/phase13/multiobjective_sweep.json`
  con tabla, frontera de Pareto y evaluación de AC-1/AC-2.
- Horizonte: `just phase13-weekly` → rotación real (`distinctVehiclesWeek = 6`, `usageStdDays = 0,47`).

## Referencias

- `backend/app/services/aco_parallel.py` — `_objective_cost`, `_build_balanced_ant_solution`, `_rebalance_pass`
- `backend/app/services/optimization_service.py` — `_solution_operational_metrics`, `_compute_kpis`, `_aco_cvrp`, `_persist_routes`, `resolve_min_active_vehicles`, `resolve_sector_partition`
- `backend/app/services/weekly_operational_service.py` — `_rotation_rest_ids`, `compute_weekly_rotation_kpis`
- **Reloj operativo (Fase 13)**: `backend/app/domain/operational_clock.py` — `resolve_operational_timezone`, `operational_departure_at`
- `backend/app/services/admin_service.py` — `resolve_operational_timezone`, `get_algorithm_settings`
- [especificacion-motor-multiobjetivo.md](./especificacion-motor-multiobjetivo.md) · [evidencia-multiobjetivo.md](./evidencia-multiobjetivo.md)
- [limites-solver.md](../fase-3/limites-solver.md) · [ADR-003](../fase-8/adr-dotacion-tiempo-servicio.md) · [ADR-004](../fase-9/adr-vertedero-multi-viaje.md) · [ADR-008](../fase-3/adr-008-ventanas-por-zona.md)
