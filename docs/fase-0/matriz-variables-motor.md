# Matriz variable → efecto en motor

Inventario de controles de UI y su impacto real en el backend de optimización/simulación.

**Leyenda de estado**

| Estado | Significado |
|--------|-------------|
| **Conectada** | La variable llega al API y modifica el cálculo o la persistencia |
| **Derivada** | No se envía directamente; se infiere en frontend y se traduce a otra variable conectada |
| **Solo visual** | Se muestra en UI pero no afecta el motor |
| **Pendiente** | Diseñada en UI; conexión al motor planificada (Fase 3) |
| **Informativa** | Solo contexto para el usuario; no es parámetro de entrada |

**Contrato del motor:** `POST /api/v1/simulations/optimize` acepta `scenarioId` y parámetros opcionales (`rainIntensity`, `wasteLevelPct`, `estimatedDurationHours`).  
Fuente: `backend/app/schemas/simulation.py`, `backend/app/services/scenario_parameters.py`, `optimization_service.run_optimization_engine`

---

## Simulación (`/simulation`)

| Variable UI | Ubicación | Estado | Efecto en motor | Notas |
|-------------|-----------|--------|-----------------|-------|
| Preset de escenario (dropdown) | Paso 1 | **Conectada** | Envía `scenarioId` al API | Valores: `normal`, `peak_traffic`, `rain`, `saturated`, `broken_vehicle` |
| Escenario personalizado (`custom`) | Paso 1 | **Derivada** | `deriveScenarioId()` → `scenarioId` | Prioridad: avería > saturado > lluvia > tráfico |
| Tráfico alto | Condición toggle | **Derivada** | → `peak_traffic` si activo (y no hay prioridad mayor) | `src/core/utils/simulationScenario.ts` |
| Lluvia intensa | Condición toggle | **Derivada** | → `rain` | |
| Vehículo averiado | Condición toggle | **Derivada** | → `broken_vehicle` | Contingencia real usa endpoint aparte (`POST /contingencies/...`) |
| Contenedor crítico | Condición toggle | **Derivada** | → `saturated` | |
| Aumento de desechos | Condición toggle | **Derivada** | → `saturated` | |
| Bloqueo de vía | Condición toggle | **Derivada** | → `peak_traffic` | |
| Accidente vial | Condición toggle | **Derivada** | → `peak_traffic` | |
| Intensidad de lluvia (baja/media/alta) | Parámetros adicionales | **Conectada** | API `rainIntensity`; escala tiempos si `scenarioId=rain` | |
| Nivel de desechos (+10%…+50%) | Parámetros adicionales | **Conectada** | API `wasteLevelPct`; suma a `fillLevelBoost` si `scenarioId=saturated` | |
| Duración estimada (2–8 h) | Parámetros adicionales | **Informativa** | API `estimatedDurationHours`; persistida, sin efecto en VRP | |
| Guardar escenario (botón) | Paso 1 | **Solo visual** | Ninguno | No persiste configuración |
| Escenarios rápidos (tarjetas) | Paso 1 | **Conectada** | Aplica `scenarioId` directamente | |
| KPIs preview (antes de ejecutar) | Panel lateral | **Informativa** | `GET /kpis?scenario=` desde seeds estáticos | No refleja corrida real hasta ejecutar |
| Despachar rutas | Paso 3 | **Conectada** | `POST` despacho de rutas optimizadas | Acción post-simulación, no parámetro de motor |
| Reportar avería (contingencia) | Panel contingencia | **Conectada** | `contingency_service` → re-optimización con meta de avería | Flujo separado del `scenarioId` |

### Efecto de cada `scenarioId` en el motor

Fuente: `data/seeds/scenarios.json`, `optimization_service.run_optimization_engine`

| scenarioId | trafficMultiplier | fillLevelBoost | Efecto |
|------------|-------------------|----------------|--------|
| `normal` | 1.0 | 0 | Condiciones base |
| `peak_traffic` | 1.35 | +5 | Tiempos de viaje × 1.35 en matriz |
| `rain` | 1.2 | +3 | Tiempos × 1.2 |
| `saturated` | 1.05 | +15 | Demanda y llenado boosteados |
| `broken_vehicle` | 1.1 | +5 | Escenario de avería (contingencia usa flujo dedicado) |

---

## Optimización (`/optimization`) — módulo operativo secundario

| Variable UI | Ubicación | Estado | Efecto en motor | Notas |
|-------------|-----------|--------|-----------------|-------|
| Escenario explícito | Selector / tarjetas | **Conectada** | `scenarioId` → API | Mismo endpoint que Simulación |
| Evitar vías con tráfico alto | Restricción | **Derivada** | `inferScenarioId()` → `peak_traffic` | Solo si no hay escenario explícito |
| Priorizar contenedores críticos | Restricción | **Derivada** | → `saturated` | |
| Considerar nivel de llenado | Restricción | **Conectada** | Toggle UI → `priorityFillLevel` en ACO | Motor ya usa llenado de BD en demanda |
| Ventana de tiempo | Restricción | **Conectada** | Toggle UI → ventanas mañana/tarde por sector | VRPTW light |
| Algoritmo | Panel informativo | **Etiquetado** | Backend siempre ACO | 12 hormigas × 20 iteraciones |
| Objetivo principal (KPI view) | Selector UI | **Conectada** | `kpiView` — narrativa; solver minimiza distancia | |
| Fecha de operación | Formulario | **Informativa** | Solo `localStorage` | No llega al API |
| Vehículos disponibles (lista) | Formulario | **Informativa** | Motor toma vehículos asignables de BD | |
| Despachar rutas | Post-resultado | **Conectada** | API de despacho | |

---

## Datos de contexto (afectan el motor sin control directo en Simulación)

| Fuente | Estado | Efecto |
|--------|--------|--------|
| Puntos de recolección activos en BD | **Conectada** | Define clientes del VRP y demanda |
| `current_fill_level_kg` por punto | **Conectada** | Demanda = f(llenado, fillLevelBoost del escenario) |
| `priority_boost` en punto | **Conectada** | Eleva demanda y prioridad si está activo |
| Vehículos con conductor asignado | **Conectada** | Capacidades y número de rutas |
| Grafo vial OSMnx (cache) | **Conectada** | Matriz de distancias/tiempos |
| Parámetros ACO (hormigas, iteraciones) | **Conectada** | Hardcoded en backend; no configurable desde UI |

---

## Salidas del motor (post-ejecución)

| Métrica | Estado | Origen |
|---------|--------|--------|
| `distanceKm` (actual vs optimizado) | **Conectada** | `_compute_kpis()` |
| `durationHours` | **Conectada** | Matriz de tiempos + escenario |
| `fuelLiters` | **Conectada** | Estimado: distancia × 0.35 L/km |
| `co2KgAvoided` | **Conectada** | Ahorro combustible × 2.68 kg/L |
| `criticalCoveragePct` | **Conectada** | % contenedores ≥80% llenado atendidos |
| `containersServed` | **Conectada** | Puntos en instancia VRP |
| `savingPercentage` | **Conectada** | `(1 - opt_dist / base_dist) × 100` |
| Indicadores de rendimiento (gauge, barras) | **Derivada** | Calculados en frontend desde KPIs |
| Tiempo de ejecución del algoritmo | **Conectada** | `engineMetrics.computationSeconds` en KPIs |
| Curva de convergencia ACO | **Conectada** | `engineMetrics.acoConvergence` + gráfico en UI |
| Puntos no cubiertos — acciones UI | **Conectada** | Replanificar, mover a mañana, revisar flota |
| Benchmark ACO reproducible | **Conectada** | `just benchmark-aco` + panel en simulación |
| Sensibilidad parámetros ACO | **Conectada** | `just phase3-sensitivity` + panel en optimización |

---

## Actualización Fase 3 rigor algorítmico (2026-08-27)

| Elemento | Estado |
|----------|--------|
| Documentación límites solver | [limites-solver.md](../fase-3/limites-solver.md) |
| Benchmark 5 escenarios × 3 perfiles | `GET/POST /benchmarks/aco` |
| Sensibilidad hormigas/iteraciones | `GET/POST /benchmarks/aco/sensitivity` |
| Defer uncovered → pendientes | `POST /planning/daily/{id}/defer-uncovered` |
| `defense-verify` ampliado | KPIs plausibles + dispatch |
| Perfil estándar 12×20 | Justificado en [evidencia-aco.md](../fase-3/evidencia-aco.md) |

---

## Actualización Fase 3 (2026-08-08)

| Variable | Estado final |
|----------|----------------|
| Intensidad de lluvia | **Conectada** — `rainIntensity` en API; factor ×1.05/×1.15/×1.30 si `scenarioId=rain` |
| Nivel de desechos (%) | **Conectada** — `wasteLevelPct` en API; suma a `fillLevelBoost` si `scenarioId=saturated` |
| Duración estimada | **Informativa** — `estimatedDurationHours` persistido; sin efecto en VRP |
| Algoritmo (UI Optimización) | **Etiquetado** — solo ACO expuesto |
| Objetivo (UI Optimización) | **Conectada** | `kpiView` — distancia/tiempo/CO₂ (solo KPIs) |
| Restricciones fill_level / time_window | **Conectada** | Ver [fase-4/README.md](../fase-4/README.md) |

---

| Fase | Variables a tratar |
|------|-------------------|
| **Fase 2** | Documentar en UI el mapeo condición → escenario derivado |
| **Fase 3** | Conectar o etiquetar: intensidad lluvia, % desechos, duración, algoritmo, objetivo, restricciones |
| **Fase 3** | Ocultar selectores de algoritmo/objetivo hasta que el backend los soporte |
| **Futuro** | Exponer parámetros ACO y tiempo de ejecución para evaluación de tesis |

---

## Backlog post-grado (no implementar pre-defensa)

Ver [post-grado/README.md](../post-grado/README.md).

| Ítem | Estado | Motivo de diferir |
|------|--------|-------------------|
| OR-Tools baseline exacto | **Backlog** | Integración pesada; comparación académica post-tesis |
| WebSocket/SSE progreso | **Backlog** | Polling de jobs suficiente para defensa |
| Tráfico en vivo (OSRM) | **Backlog** | Infraestructura externa |
| Multi-objetivo en solver | **Backlog** | Cambio profundo del fitness ACO |
| Toolbar GIS completo | **Backlog** | Valor operativo, no central en tesis |
