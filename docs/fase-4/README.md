# Fase 4 — Cierre del recorrido post-simulación

**Estado:** completado  
**Fecha:** 2026-08-08

## Objetivo

Tras ejecutar una simulación, el usuario continúa el análisis sin preguntar “¿y ahora a dónde voy?”.

## Entregables

| Entregable | Implementación |
|------------|----------------|
| Barra de acciones post-resultado | `PostSimulationActions.tsx` en paso 3 |
| Historial en `/simulation` | Pestaña **Historial** (`?view=history`) |
| Enlaces cruzados Simulación ↔ Analítica ↔ Reportes | `simulationLinks.ts` + deep links `?simulationId=` |
| Dashboard con última simulación | Tarjeta con enlaces a resultados, analítica y reportes |

## Deep links

| Ruta | Parámetro | Comportamiento |
|------|-----------|----------------|
| `/simulation?simulationId={id}` | Carga historial y abre paso 3 |
| `/simulation?view=history` | Abre pestaña Historial |
| `/analytics?simulationId={id}` | Banner de contexto + enlace de vuelta |
| `/reports?simulationId={id}` | Banner de contexto + enlace de vuelta |

## Archivos clave

- `src/core/utils/simulationLinks.ts` — helpers de URL
- `src/features/simulation/PostSimulationActions.tsx` — barra de acciones (mapa, analítica, reportes, CSV/PDF, nueva simulación, despacho)
- `src/features/simulation/SimulationHistoryPanel.tsx` — tabla de historial de tesis
- `src/features/simulation/SimulationContextBanner.tsx` — banner en analítica/reportes
- `src/features/simulation/index.tsx` — pestañas Flujo / Historial
- `src/features/dashboard/index.tsx` — tarjeta “Última simulación”
- `src/features/optimization/index.tsx` — nota: historial operativo ≠ historial de escenarios

## Criterio de cierre

1. Ejecutar simulación → paso 3 muestra barra “¿Qué quieres hacer ahora?”
2. Cada acción lleva a mapa, analítica, reportes o descarga
3. Dashboard enlaza la última simulación con `simulationId`
4. Planificación operativa mantiene su historial sin duplicar escenarios de tesis

## Verificación manual

```text
1. /simulation → ejecutar → paso 3 → probar cada botón de PostSimulationActions
2. /simulation?view=history → ver tabla y abrir una simulación
3. /simulation?simulationId=1 → debe abrir resultados directamente
4. /analytics?simulationId=1 → banner + volver a resultados
5. Dashboard → “Última simulación” → Ver resultados / Analítica / Reportes
```
