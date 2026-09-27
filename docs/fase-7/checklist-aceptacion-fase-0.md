# Checklist — Aceptación Fase 7.0 (diseño y contrato)

**Fecha revisión:** 2026-08-10  
**Revisor:** _________________

## Máquina de estados

- [x] 8 fases nombradas en orden: `preparando` → `grafo_vial` → `matriz_costos` → `instancia_vrp` → `aco` → `refinamiento_2opt` → `persistencia` → `listo`
- [x] Estados terminales definidos: `idle`, `listo`, `cancelado`, `error`
- [x] Eventos documentados: `START`, `ADVANCE`, `COMPLETE`, `CANCEL`, `FAIL`, `RESET`
- [x] Diagrama Mermaid en [maquina-estados-ejecucion.md](./maquina-estados-ejecucion.md)
- [x] Mapeo a logs backend y mock

## Textos didácticos

- [x] Cada fase tiene línea «qué hace la IA»
- [x] Cada fase tiene línea «por qué importa»
- [x] Mensajes de cancelación y error
- [x] Frase guía de 10 s para defensa

## Wireframe

- [x] Stepper vertical con 8 etapas y estados visuales
- [x] Mapa animado con comportamiento por fase
- [x] Panel de logs
- [x] Botón «Cancelar ejecución»
- [x] Layout desktop y notas mobile
- [x] Mapeo a componentes futuros

## Decisión técnica (ADR-002)

- [x] Corto plazo: progreso simulado + `AbortController`
- [x] Mediano plazo: jobs + SSE/polling + cancel backend
- [x] Limitaciones del corto plazo documentadas
- [x] Contrato `ExecutionPhaseId` estable entre etapas

## Contrato de código

- [x] `src/features/simulation/executionPhases.ts` exporta fases, pesos y helpers
- [x] `resolvePhaseFromLogMessage()` para reconciliar logs
- [x] `getPhaseProgressPercent()` para barra de progreso

## Criterio «evaluador en &lt;10 s»

Prueba de lectura (sin abrir código):

1. [ ] Abrir [textos-didacticos-fases.md](./textos-didacticos-fases.md) + [wireframe-ejecucion-simulacion.md](./wireframe-ejecucion-simulacion.md)
2. [ ] Cronometrar: ¿se entiende qué muestra la pantalla durante la ejecución?
3. [ ] Objetivo: ≤ 10 segundos

**Resultado prueba:** ___ / 10 s — Pass / Fail

## Siguiente paso

Al marcar este checklist, iniciar **Fase 7.1** (`SimulationExecutionStepper` + integración en `ExecutionPanel`).
