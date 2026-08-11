# ADR-002: Progreso de ejecución — simulado en frontend vs streaming en backend

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado |
| **Fecha** | 2026-08-10 |
| **Fase** | 7 — Ejecución explicativa |
| **Relacionado** | [maquina-estados-ejecucion.md](./maquina-estados-ejecucion.md), [wireframe-ejecucion-simulacion.md](./wireframe-ejecucion-simulacion.md) |

## Contexto

La optimización en FEROMAP se invoca con `POST /api/v1/simulations/optimize`. El motor (`optimization_service.run_optimization_engine`) ejecuta de forma **síncrona** en el hilo de la petición HTTP:

1. Carga grafo OSM / matriz de costos
2. Resuelve VRP con ACO + 2-opt
3. Persiste en PostgreSQL
4. Devuelve `{ kpis, routes, logs, simulationId }`

En el frontend (`simulationStore.runOptimization`):

- **Modo mock:** reproduce `optimizationLogMessages` con `delay()` artificial.
- **Modo API:** espera la respuesta completa y **luego** reproduce `result.logs` con `delay()` — el usuario no ve progreso real durante el POST.

Para la defensa se necesita:

- Stepper de 8 fases comprensible en &lt;10 s
- Animación en mapa alineada a la fase
- Botón cancelar

Implementar streaming completo en backend es costoso; no hacer nada deja una UX opaca.

## Decisión

Adoptar un enfoque **en dos etapas**:

### Corto plazo (Fases 7.1–7.3) — Progreso simulado en frontend

| Aspecto | Enfoque |
|---------|---------|
| Fuente de fase | Máquina de estados en cliente (`executionPhases.ts`) |
| Avance | Timers por peso de fase mientras `fetch` está pendiente |
| Logs | Al llegar respuesta, reconciliar logs con `resolvePhaseFromLogMessage()` |
| Cancelar | `AbortController` aborta el `fetch`; reset UI a `cancelado` |
| Mapa | Animación por `phaseId` (no requiere datos parciales del servidor) |

**Limitación aceptada:** si el POST ya llegó al backend, el cálculo puede terminar en servidor aunque el usuario cancele en UI (sin job id). Se documenta en manual y mensaje de cancelación.

### Mediano plazo (Fase 7.4) — Progreso real + cancelación backend

| Aspecto | Enfoque |
|---------|---------|
| API | `POST /simulations/optimize` → `{ jobId }` |
| Progreso | `GET /simulations/jobs/{id}` (polling) o `GET .../events` (SSE) |
| Payload evento | `{ phaseId, progress, message, timestamp }` |
| Cancelar | `POST /simulations/jobs/{id}/cancel` → `{ status: cancelled }` |
| Motor | Instrumentar `optimization_service` en los mismos 8 hitos que `_optimization_logs` |

El contrato `ExecutionPhaseId` **no cambia** entre corto y mediano plazo; solo cambia quién emite `ADVANCE`.

## Alternativas consideradas

### A — Solo mejorar textos en logs actuales

- **Pros:** Cero cambios de arquitectura.
- **Contras:** No cumple criterio &lt;10 s; sin stepper ni mapa; sin cancelar.
- **Descartada.**

### B — WebSocket bidireccional desde el día 1

- **Pros:** Progreso y cancelación reales inmediatos.
- **Contras:** Infraestructura nueva, más superficie de error para defensa.
- **Descartada** para primera entrega; SSE/polling es suficiente en Fase 7.4.

### C — Progreso 100 % simulado sin llamar API hasta el final

- **Pros:** Control total de tiempos.
- **Contras:** Deshonesto si la API falla tarde; doble tiempo percibido.
- **Descartada.**

## Consecuencias

### Positivas

- Fases 1–3 implementables en días sin tocar Python.
- Misma UX didáctica en mock y API.
- Migración a jobs sin rediseñar wireframe ni copy.

### Negativas / trade-offs

- Cancelar en corto plazo no detiene el motor en servidor.
- Progreso en `aco` es representativo, no iteración real de hormigas.
- Requiere reconciliación si API responde muy rápido o muy lento.

### Neutras

- `_optimization_logs` sigue siendo la plantilla de mensajes hasta instrumentación real.
- `ExecutionPanel` se extiende, no se reemplaza.

## Contrato estable (TypeScript)

```typescript
type ExecutionPhaseId =
  | 'preparando' | 'grafo_vial' | 'matriz_costos' | 'instancia_vrp'
  | 'aco' | 'refinamiento_2opt' | 'persistencia' | 'listo';

type ExecutionStatus = 'idle' | 'running' | 'listo' | 'cancelado' | 'error';
```

Ver implementación: `src/features/simulation/executionPhases.ts`.

## Plan de implementación

| Subfase | Entregable |
|---------|------------|
| 7.0 | Este ADR + máquina de estados + wireframe + contrato TS |
| 7.1 | `SimulationExecutionStepper` + narrativa en `ExecutionPanel` |
| 7.2 | Capas animadas en mapa por `phaseId` |
| 7.3 | `cancelOptimization()` + `AbortController` |
| 7.4 | Jobs API + SSE/polling + cancel backend |
| 7.5 | Guion demo, `aria-live`, tests |

## Referencias

- `backend/app/services/optimization_service.py` — `_optimization_logs`, `run_optimization_engine`
- `src/core/stores/simulationStore.ts` — `runOptimization`
- `src/features/simulation/ExecutionPanel.tsx`
