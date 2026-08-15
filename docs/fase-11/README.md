# Fase 11 — Demostración ACO (laberinto didáctico)

**Estado:** Fase 11.7 completada  
**Fecha inicio:** 2026-08-15

## Objetivo

Ofrecer una **demostración educativa** del algoritmo de colonia de hormigas (ACO) usado en FEROMAP: explicación conceptual, laberinto interactivo con feromonas, hormigas e iteraciones, y curva de convergencia — **sin mezclar** con simulación de tesis ni planificación operativa.

## Alcance por subfases

| Fase | Alcance | Estado |
|------|---------|--------|
| **11.0** | Ruta, permisos, sidebar, header, docs, placeholder | ✅ Completada |
| **11.1** | Panel explicativo del algoritmo | ✅ Completada |
| **11.2** | Modelo del laberinto (grilla, presets) | ✅ Completada |
| **11.3** | Motor ACO didáctico en cliente | ✅ Completada |
| **11.4** | Visualización canvas (feromonas, hormigas) | ✅ Completada |
| **11.5** | Controles de playback e iteración | ✅ Completada |
| **11.6** | Convergencia y vínculo con motor real | ✅ Completada |
| **11.7** | Pulido, accesibilidad y guion de defensa | ✅ Completada |

## Entregables Fase 11.0

| Entregable | Ubicación |
|------------|-----------|
| Ruta lazy `/demostracion` | `src/app/App.tsx` |
| Permisos y nav lateral | `src/core/auth/permissions.ts` |
| Icono sidebar (Beaker) | `src/design-system/layout/Sidebar.tsx` |
| Título header | `src/design-system/layout/Header.tsx` |
| Meta de página | `src/data/mock/demostracion.ts` |
| Página placeholder | `src/features/demostracion/index.tsx` |
| Reglas de separación | `docs/fase-5/reglas-navegacion.md` |

## Criterios de aceptación (11.0)

- [x] Planificador y administrador ven «Demostración» en la sección **Análisis** del menú lateral.
- [x] Conductor y residente no tienen el ítem en el menú ni acceso a `/demostracion`.
- [x] La página muestra el copy: «Aquí verás cómo el ACO explora y converge».

## Entregables Fase 11.1

| Entregable | Ubicación |
|------------|-----------|
| Panel didáctico (5 secciones + tabla) | `src/features/demostracion/DemoConceptPanel.tsx` |
| Constantes α, β, ρ alineadas al backend | `src/core/demo-aco/demoAcoParams.ts` |
| Guion de defensa ACO | `docs/fase-11/guion-demo-aco.md` |

## Criterios de aceptación (11.1)

- [x] Secciones: Problema, Hormiga, Feromonas, Iteración, Parámetros del proyecto.
- [x] Valores reales documentados (`aco_parallel.py`, `optimization_service.py`, `config.py`).
- [x] Un lector sin contexto puede seguir el flujo en menos de 3 minutos.

## Entregables Fase 11.2

| Entregable | Ubicación |
|------------|-----------|
| Tipos de grilla y grafo | `src/core/demo-aco/mazeTypes.ts` |
| 4 presets (simple, atajo, dead-ends, óptimo vs subóptimo) | `src/core/demo-aco/mazes.ts` |
| Vecinos 4-dir, validación, BFS | `src/core/demo-aco/mazeGraph.ts` |
| Tests de consistencia y solución conocida | `src/core/demo-aco/mazeGraph.test.ts` |

## Criterios de aceptación (11.2)

- [x] Celdas con `(x, y)`, paredes N/E/S/W, inicio y fin.
- [x] Movimiento solo cardinal (sin diagonal).
- [x] Cada preset tiene solución conocida validada por BFS.
- [x] Grafo consistente (paredes simétricas, un inicio y un fin).

## Entregables Fase 11.3

| Entregable | Ubicación |
|------------|-----------|
| Motor ACO paso a paso | `src/core/demo-aco/demoAcoEngine.ts` |
| Snapshots por iteración | `DemoAcoSnapshot`, `DemoAcoAntSnapshot` |
| API `runDemoAco` / `stepDemoAco` | `createDemoAcoEngine`, `stepDemoAco` |
| Tests deterministas | `src/core/demo-aco/demoAcoEngine.test.ts` |

## Criterios de aceptación (11.3)

- [x] α, β, ρ y depósito Q alineados al backend.
- [x] Selección roulette, evaporación global y depósito en mejor ruta de iteración.
- [x] Laberinto simple converge al costo óptimo con semilla fija.
- [x] Snapshots reproducibles con la misma semilla.

## Entregables Fase 11.4

| Entregable | Ubicación |
|------------|-----------|
| Canvas del laberinto | `src/features/demostracion/MazeDemoCanvas.tsx` |
| Motor de dibujo | `src/core/demo-aco/mazeCanvasDraw.ts` |
| Mapeo feromonas → color | `src/core/demo-aco/pheromoneColor.ts` |
| Leyenda | `src/features/demostracion/DemoLegend.tsx` |
| Panel demo (preview) | `src/features/demostracion/MazeDemoPanel.tsx` |

## Criterios de aceptación (11.4)

- [x] Capas: celdas/paredes, feromonas, rutas de hormigas, mejor ruta, hormiga activa, inicio/meta.
- [x] Gradiente azul → ámbar en aristas con grosor proporcional.
- [x] Mejor ruta sólida y distinguible de exploración tenue.

## Entregables Fase 11.5

| Entregable | Ubicación |
|------------|-----------|
| Store y playback | `src/core/demo-aco/demoAcoStore.ts` |
| Controles UI | `src/features/demostracion/DemoPlaybackControls.tsx` |
| Panel de estado | `formatDemoAcoStatusLabel` / `statusLabel()` |
| Tests playback | `src/core/demo-aco/demoAcoStore.test.ts` |

## Criterios de aceptación (11.5)

- [x] Iniciar, reiniciar, play/pause, velocidades 0.5× / 1× / 2×.
- [x] Slider de iteración con scrub instantáneo (pausa al arrastrar).
- [x] Selector de hormiga y modos: todas / solo mejor / solo feromonas.
- [x] Selector de laberinto preset integrado en controles.

## Entregables Fase 11.6

| Entregable | Ubicación |
|------------|-----------|
| Adaptador convergencia laberinto → chart | `src/core/demo-aco/demoConvergence.ts` |
| Panel comparativo + banner | `src/features/demostracion/DemoConvergencePanel.tsx` |
| Chart reutilizado | `src/features/simulation/AcoConvergenceChart.tsx` (props de unidad) |
| Benchmark rutas reales | `AcoBenchmarkPanel` en `DemoConvergencePanel` |

## Criterios de aceptación (11.6)

- [x] Curva costo vs iteración del laberinto.
- [x] Tabla laberinto vs VRP y copy de escalado al motor real.
- [x] Enlace a simulación de escenarios completos.
- [x] Benchmark ACO integrado bajo «ACO en rutas reales».

## Entregables Fase 11.7

| Entregable | Ubicación |
|------------|-----------|
| Shell responsive (sidebar desktop / tabs móvil) | `src/features/demostracion/DemostracionShell.tsx`, `demostracionTabs.ts` |
| Modo presentación 60 s (preset atajo, 2×, loop) | `src/core/demo-aco/demoAcoStore.ts`, `DemoPlaybackControls.tsx` |
| Contraste heatmap feromonas | `src/core/demo-aco/pheromoneColor.ts` |
| Labels y ARIA en controles | `DemoPlaybackControls.tsx`, `DemoLegend.tsx` |
| E2E mínimo | `e2e/demostracion.spec.ts` |
| Escena en guion de defensa | `docs/fase-6/guion-demo-defensa.md` |

## Criterios de aceptación (11.7)

- [x] Panel lateral en desktop; pestañas apiladas/scroll en móvil.
- [x] Controles con labels; heatmap azul/ámbar de alto contraste.
- [x] Modo presentación: auto-play 60 s con laberinto «con atajo» preseleccionado.
- [x] E2E: `/demostracion` → iniciar demo → ver convergencia.
- [x] Guion de defensa actualizado con escena «Demostración ACO».

## Separación de responsabilidades

| Módulo | Rol |
|--------|-----|
| `/demostracion` | Didáctica — cómo funciona el ACO (laberinto) |
| `/simulation` | Evaluación de escenarios de tesis |
| `/optimization` | Operación del día — despacho de rutas |

Ver [reglas-navegacion.md](../fase-5/reglas-navegacion.md).

## Referencias

- Motor ACO producción: `backend/app/services/optimization_service.py`, `backend/app/services/aco_parallel.py`
- Chart convergencia (reutilizar): `src/features/simulation/AcoConvergenceChart.tsx`
