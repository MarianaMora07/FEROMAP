# Fase 4 — Restricciones pendientes

**Estado:** completado  
**Fecha:** 2026-08-27

Cierre de brechas funcionales para preguntas del jurado sobre llenado y ventanas horarias.

## Entregables

| ID | Entregable | Estado |
|----|------------|--------|
| 4.1 | Prioridad por llenado (`fill_level`) | **Conectada** — heurística ACO + feromonas |
| 4.2 | Ventanas horarias simplificadas (`time_window`) | **Conectada** — mañana/tarde por sector |
| 4.3 | Objetivo secundario en KPIs (`kpiView`) | **Conectada** — narrativa UI, solver sin cambio |

## Comportamiento

### Prioridad por llenado
- Toggle **Considerar nivel de llenado** en `/optimization`.
- Contenedores ≥80% reciben factor 0.70 en matriz heurística y bonus η en selección de hormiga.
- El fitness del ACO sigue siendo **distancia total**.

### Ventanas horarias (VRPTW light)
- Toggle **Ventana de tiempo** activa ventanas amplias por sector:
  - Sectores pares → 06:00–12:00
  - Sectores impares → 12:00–18:00
- Validación en construcción de ruta del ant (`build_ant_solution`).

### KPI view
- Selector **Mostrar resultados por**: distancia | tiempo | CO₂.
- Resalta la fila correspondiente en el panel Baseline vs ACO.
- No modifica el objetivo del solver.

## API

```http
POST /api/v1/planning/daily/{id}/optimize
{
  "priorityFillLevel": true,
  "timeWindowEnabled": false,
  "kpiView": "distance"
}
```

Campos equivalentes en `POST /api/v1/simulations/optimize`.

## Tests

```bash
cd backend && python -m pytest tests/test_route_constraints.py -v
```

## Archivos clave

- `backend/app/services/route_constraints.py`
- `backend/app/services/aco_parallel.py`
- `backend/app/services/optimization_service.py`
- `src/features/optimization/OptimizationParametersForm.tsx`
