# Backlog 2 — WebSocket / SSE para progreso y monitoreo

**Estado:** backlog  
**Esfuerzo:** 5–8 días  
**Prioridad post-grado:** media

## Objetivo

Reemplazar o complementar el **polling** (`GET /simulations/jobs/{id}` cada 450 ms) por **Server-Sent Events (SSE)** o WebSocket para:

- Progreso de optimización (fases, logs, convergencia ACO)
- Monitoreo en vivo de flota (posición, estado de ruta)

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| No crítico para defensa | Jobs + polling ya implementados (Fase 1–2); demo funcional |
| Infra adicional | Nginx/proxy debe soportar SSE; sticky sessions si WebSocket |
| Complejidad operativa | Reconexión, heartbeats, auth en canal largo |
| ADR existente | [ADR-002](../fase-7/adr-002-progreso-ejecucion-simulacion.md) eligió polling para Fase 7.4 |

## Estado actual (línea base)

| Componente | Implementación |
|------------|----------------|
| Optimización async | `optimization_job_service.py` + `jobId` |
| Frontend polling | `optimization.ts` / `simulationJobRunner.ts` @ 450 ms |
| Cancelación | `POST /simulations/jobs/{id}/cancel` |
| Convergencia | `acoConvergence[]` en snapshot del job |
| Monitoreo mapa | Polling o refresh manual en `/monitoring` |

## Diseño propuesto (SSE primero)

### API

```
GET /api/v1/simulations/jobs/{id}/events   → text/event-stream
```

Eventos:

```json
{ "type": "phase", "phaseId": "aco", "progress": 62 }
{ "type": "log", "message": "...", "logType": "info" }
{ "type": "convergence", "iteration": 12, "bestDistanceKm": 28.4 }
{ "type": "completed", "result": { ... } }
```

### Frontend

- `EventSource` con fallback a polling si SSE no disponible
- Misma interfaz `DailyOptimizationProgress` — sin cambiar componentes de UI

### WebSocket (opcional fase 2)

- Bidireccional para monitoreo + comandos operador
- Solo si SSE no basta para múltiples canales

## Criterios de aceptación

- [ ] SSE funcional detrás de Nginx en `COMPOSE_ENV=prod`
- [ ] Latencia percibida de logs < 200 ms vs polling
- [ ] Fallback automático a polling si conexión SSE falla
- [ ] Test de integración: job emite ≥3 eventos antes de `completed`
- [ ] Documentar en `backend/docs/API.md`

## Riesgos

- Conexiones colgadas en deploy sin timeout
- Duplicación de eventos si cliente no deduplica por `id`

## Referencias

- `src/core/api/optimization.ts` — `JOB_POLL_MS = 450`
- `backend/app/services/optimization_job_service.py` — `JobProgressReporter`
