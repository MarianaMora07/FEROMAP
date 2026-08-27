# Backlog 4 — Multi-objetivo en el solver

**Estado:** backlog  
**Esfuerzo:** 12–20 días  
**Prioridad post-grado:** baja (línea de investigación)

## Objetivo

Extender el **fitness del ACO** más allá de minimizar distancia, incorporando objetivos como tiempo total, emisiones CO₂ o cobertura crítica en una función escalarizada o frente de Pareto.

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| Cambio profundo | Toca feromonas, costo de aristas, criterio de comparación entre hormigas |
| Narrativa defensa | Tesis congelada: «ACO minimiza distancia; KPIs derivados» (Fase 4 `kpiView`) |
| Validación | Requiere nuevo benchmark y posible confusión jurado si se mezcla con demo |
| Complejidad UX | Pesos α/β/γ por objetivo — otro panel de parámetros |

## Estado actual (Fase 4)

| Capa | Comportamiento |
|------|----------------|
| Solver | `min Σ distancia` |
| KPIs | Distancia, tiempo, combustible, CO₂, cobertura crítica |
| UI | `kpiView` resalta métrica en tabla — **sin cambiar fitness** |
| Evidencia | Benchmark + sensibilidad en Fase 3 |

## Enfoques posibles (post-grado)

### A — Escalarización (recomendado primero)

```
fitness = w_d · dist + w_t · time + w_c · co2_estimate
```

- Pesos configurables en admin o escenario
- Compatible con ACO actual con matriz de costos compuesta

### B — Frente de Pareto (investigación)

- Múltiples colonias o ε-constraint
- Visualización en UI para planificador
- Publicable pero pesado para producción

### C — Objetivo lexicográfico

1. Maximizar cobertura
2. Minimizar distancia entre empates

## Criterios de aceptación

- [ ] ADR que documente función de fitness elegida
- [ ] No regresión en `defense-verify` con pesos por defecto (solo distancia)
- [ ] Tabla comparativa mono vs multi en `docs/post-grado/evidencia-multi-objetivo.md`
- [ ] Tests unitarios de función de costo compuesta

## Riesgo de scope creep

Si se implementa antes de OR-Tools baseline, será difícil argumentar **cuánto** mejora el multi-objetivo vs un solver exacto mono-objetivo.

## Referencias

- `backend/app/services/optimization_service.py` — `_aco_cvrp`
- `src/core/utils/optimizationResults.ts` — `buildBaselineAcoComparisonRows`
- Fase 4: `docs/fase-4/README.md`
