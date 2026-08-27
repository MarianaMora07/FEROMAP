# Post-grado / producción — Backlog (roadmap)

**Estado:** backlog congelado (no implementar antes de la defensa)  
**Fecha:** 2026-08-27  
**Relación con fases del repo:** este documento corresponde al **roadmap post-tesis**. No confundir con [fase-5/](../fase-5/README.md) (delimitación Simulación vs Optimización, ya completada en 2026-08-08).

## Criterio de entrada

Solo iniciar ítems de este backlog cuando:

1. Fases 0–4 de la tesis estén cerradas y defendidas.
2. `just defense-verify` pase en el entorno de producción objetivo.
3. Exista decisión explícita de producto (no scope creep pre-defensa).

## Índice de ítems

| # | Ítem | Doc | Esfuerzo estimado | Prioridad sugerida |
|---|------|-----|-------------------|-------------------|
| 1 | OR-Tools como baseline exacto | [or-tools-baseline.md](./or-tools-baseline.md) | 8–15 días | Alta (publicación) |
| 2 | WebSocket / SSE progreso y monitoreo | [websocket-sse.md](./websocket-sse.md) | 5–8 días | Media |
| 3 | Tráfico en vivo (OSRM, etc.) | [trafico-en-vivo.md](./trafico-en-vivo.md) | 10–20 días | Media-baja |
| 4 | Multi-objetivo en el solver | [multi-objetivo-solver.md](./multi-objetivo-solver.md) | 12–20 días | Baja (investigación) |
| 5 | Toolbar GIS completo | [toolbar-gis.md](./toolbar-gis.md) | 6–10 días | Media (operación) |

## Por qué esperar (resumen)

| Ítem | Por qué no antes de la defensa |
|------|--------------------------------|
| OR-Tools | Comparación académica fuerte, pero integración pesada y riesgo de regresión |
| WebSocket/SSE | Mejor que polling; hoy jobs + polling son suficientes para demo |
| Tráfico en vivo | Dependencia de infraestructura externa, SLA y costos |
| Multi-objetivo en solver | Cambio profundo del fitness ACO; contradice narrativa congelada |
| Toolbar GIS completo | Valor operativo real, no central en el capítulo de tesis |

## Estado actual (línea base post-Fase 4)

| Capacidad | Implementación actual | Backlog |
|-----------|----------------------|---------|
| Solver | ACO + 2-opt, minimiza distancia | OR-Tools benchmark, multi-objetivo |
| Progreso optimización | Jobs + polling 450 ms | SSE/WebSocket |
| Tiempos de viaje | Grafo OSMnx + multiplicadores escenario | OSRM / tráfico live |
| KPIs CO₂/tiempo | Derivados post-solución (`kpiView`) | Fitness multi-objetivo |
| Mapa operativo | Capas, playback, toggle rutas | Toolbar GIS medición/edición |

## Comandos de referencia (tesis)

```bash
just defense-verify      # regresión pre-defensa
just benchmark-aco       # evidencia ACO
just phase3-sensitivity  # trade-offs parámetros
```

## Documentos relacionados

- [Alineación pre-defensa](../fase-0/alineacion-defensa.md) — exclusiones congeladas
- [Límites del solver](../fase-3/limites-solver.md) — qué resuelve hoy
- [ADR-002 progreso](../fase-7/adr-002-progreso-ejecucion-simulacion.md) — polling vs SSE

## Criterio de salida del backlog (producción madura)

Al menos **dos** ítems implementados con:

- ADR o doc de diseño aprobado
- Tests de regresión automatizados
- Actualización de `manual-usuario.md` y `defense-verify` (o su equivalente `prod-verify`)
