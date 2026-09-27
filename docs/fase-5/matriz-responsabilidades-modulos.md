# Matriz de responsabilidades — Simulación vs Planificación operativa

**Opción A · Fase 5 · 2026-08-08**

| Módulo | Ruta | Propósito | Usuario principal | Salida principal | Historial |
|--------|------|-----------|-------------------|------------------|-----------|
| **Simulación de escenarios** | `/simulation` | Evaluar escenarios y desempeño del algoritmo (tesis / defensa) | Planificador, evaluador | KPIs comparativos + impacto ambiental/operativo | Completo en pestaña Historial (`?view=history`) |
| **Planificación operativa** | `/optimization` | Operación diaria de rutas | Planificador operativo | Rutas listas para despacho | Solo corridas iniciadas desde este módulo (localStorage + API) |

## Qué incluye cada pantalla

### Simulación (`/simulation`)

| Incluye | No incluye |
|---------|------------|
| Wizard 3 pasos (configuración → ejecución → resultados) | Fecha de operación del día |
| Toggles de condiciones (tráfico, lluvia, saturación…) | Restricciones operativas (`avoid_traffic`, etc.) |
| Parámetros conectados (lluvia, desechos) + informativos (duración) | Despacho directo a operación |
| Resumen ejecutivo y comparación actual vs simulado | Historial operativo del día |
| Acciones post-resultado: mapa, analítica, reportes, CSV/PDF | Pestaña de escenarios guardados operativos |
| Historial de escenarios de tesis | |

### Planificación operativa (`/optimization`)

| Incluye | No incluye |
|---------|------------|
| Fecha de operación (informativa, localStorage) | Wizard de evaluación de tesis |
| Restricciones operativas | Toggles de condiciones de escenario |
| Escenario operativo (selector simple para el día) | Comparación KPI tesis (tabla actual vs simulado) |
| Generar ruta operativa + mapa de rutas | Parámetros lluvia/desechos de tesis |
| Despachar rutas a operación | Historial completo de simulaciones de tesis |
| Historial operativo propio | Pestaña de exploración de escenarios |

## Stores y API

| Recurso | Simulación | Optimización |
|---------|------------|--------------|
| Store | `simulationStore` | `optimizationStore` |
| Ejecutar | `runOptimization(parameters?)` con payload de escenario | `executeOptimization()` con preset operativo |
| Historial | `fetchSimulationHistory()` — listado completo API | `fetchOperationalHistory()` — subconjunto por `recordOperationalRun()` |
| Despacho | No expuesto en UI | `dispatchOptimizationResult()` |
| Endpoint motor | `POST /api/v1/simulations/optimize` (compartido) | Mismo endpoint; el origen UX determina el historial mostrado |

## Cuándo usar cada módulo

```
¿Necesitas medir impacto del algoritmo bajo escenarios (lluvia, tráfico, saturación)?
  → Simulación de escenarios

¿Necesitas generar y despachar las rutas de hoy?
  → Planificación operativa
```
