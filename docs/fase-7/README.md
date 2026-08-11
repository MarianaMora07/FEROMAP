# Fase 7 — Ejecución explicativa de la simulación

**Estado:** Fase 5 completada (pulido defensa, accesibilidad, tests)  
**Fecha inicio:** 2026-08-10  
**Pantalla objetivo:** `/simulation` → paso 2 «Revisión y ejecución»

## Problema

Hoy el paso 2 muestra una barra de progreso genérica y una lista de logs. El evaluador no distingue en qué **fase del motor** está la IA ni **qué está calculando** en el mapa. Tampoco puede **cancelar** una ejecución en curso.

## Objetivo de la fase completa (0–5)

Que cualquier evaluador entienda en **menos de 10 segundos** qué está haciendo el sistema durante la optimización, con apoyo visual y textual, y con opción de cancelar.

## Entregables Fase 0 (este documento)

| Entregable | Ubicación |
|------------|-----------|
| Máquina de estados (8 fases) | [maquina-estados-ejecucion.md](./maquina-estados-ejecucion.md) |
| Textos didácticos por fase | [textos-didacticos-fases.md](./textos-didacticos-fases.md) |
| Wireframe paso 2 | [wireframe-ejecucion-simulacion.md](./wireframe-ejecucion-simulacion.md) |
| ADR progreso simulado vs real | [adr-002-progreso-ejecucion-simulacion.md](./adr-002-progreso-ejecucion-simulacion.md) |
| Contrato TypeScript (fases UI) | `src/features/simulation/executionPhases.ts` |
| Checklist aceptación Fase 0 | [checklist-aceptacion-fase-0.md](./checklist-aceptacion-fase-0.md) |

## Fases de implementación

| Fase | Alcance | Estado |
|------|---------|--------|
| **0** | Diseño, contrato, wireframe, ADR | ✅ Completada |
| **1** | Stepper vertical + narrativa en `ExecutionPanel` | ✅ Completada |
| **2** | Animación progresiva en mapa por fase | ✅ Completada |
| **3** | Botón cancelar (MVP frontend + `AbortController`) | ✅ Completada |
| **4** | Jobs backend + SSE/polling + cancelación real | ✅ Completada |
| **5** | Pulido defensa, accesibilidad, tests, guion demo | ✅ Completada |

## Criterio de aceptación Fase 0

- [ ] Las 8 fases están nombradas, ordenadas y con transiciones definidas.
- [ ] Cada fase tiene texto «qué hace la IA» y «por qué importa».
- [ ] Existe wireframe con stepper + mapa + logs + cancelar.
- [ ] ADR documenta corto plazo (progreso simulado) y mediano plazo (SSE/polling).
- [ ] Contrato TS exporta tipos y constantes reutilizables en Fases 1–4.
- [ ] Un evaluador puede leer solo la documentación y entender el flujo en &lt;10 s.

## Relación con código actual

| Componente actual | Rol tras Fase 7 |
|-------------------|-----------------|
| `ExecutionPanel.tsx` | Panel de logs + barra; se amplía con stepper |
| `simulationStore.ts` | `runOptimization` reproduce logs; adoptará `executionPhase` |
| `optimization_service.py` | `_optimization_logs()` — fuente de verdad de mensajes backend |
| `SimulationMapPanel.tsx` | Mapa estático en paso 2; Fase 2 añade capas animadas |

## Verificación

Revisar [checklist-aceptacion-fase-0.md](./checklist-aceptacion-fase-0.md) antes de iniciar Fase 1.
