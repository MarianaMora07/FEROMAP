# Backlog 6 — Capa de recuperación ante disrupciones (inserción / ALNS)

**Estado:** backlog  
**Esfuerzo:** 5–10 días (inserción) · 15–25 días (ALNS + comparación)  
**Prioridad post-grado:** alta (aporte académico directo)  
**Relación:** implementa el plan de comparación de [ADR-003](../fase-0/adr-contingencias.md)

## Objetivo

Añadir sobre el motor actual una **capa de recuperación ante disrupciones** que resuelva averías y
contenedores críticos como un problema de *reinserción/inserción dinámica*, en lugar de un
re-solve ACO “desde cero”:

- **Insertar** las paradas liberadas (avería) o la parada urgente (contenedor crítico) en las
  rutas **ya en curso**, respetando capacidad, jornada restante y posición del vehículo receptor.
- **Minimizar la desviación** respecto al plan publicado (estabilidad), no solo la distancia.
- **Decidir el descarte por prioridad** (criticidad/SLA) cuando no sea reasignable.

Y **comparar** esa capa contra el baseline actual (re-solve ACO) con métricas de estabilidad y
tiempo de respuesta.

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| Toca el corazón de la demo | Avería/contenedor son los momentos más sensibles de la defensa |
| Requiere modelar estado | Carga recogida, posición y jornada restante por vehículo |
| Calibración ALNS | Parámetros y operadores de destrucción/reparación sensibles |
| Narrativa congelada | [alineacion-defensa.md](../fase-0/alineacion-defensa.md) §2 cierra el alcance |
| Ya hay baseline defendible | [ADR-003](../fase-0/adr-contingencias.md) documenta la decisión actual |

## Alcance propuesto

### Incluido

- `backend/app/services/disruption_recovery_service.py` con **cheapest** y **regret insertion**
  sobre rutas en curso (usa `RouteWaypoint` + estado del vehículo).
- Modelo de **penalización por desviación** (paradas movidas de vehículo / desvío de km).
- **Triage** de descarte por criticidad (reutiliza `domain/criticality.py`).
- **ALNS** (opcional, fase 2 del ítem) como reoptimización de vecindario grande.
- Script de **comparación** baseline (re-solve ACO) vs capa de recuperación.
- Reporte `docs/post-grado/evidencia-recuperacion.md` (auto-generado).

### Excluido

- Sustituir el ACO del plan base de la semana.
- OR-Tools en ruta crítica de producción (ver [or-tools-baseline.md](./or-tools-baseline.md)).
- Tráfico en vivo ([trafico-en-vivo.md](./trafico-en-vivo.md)).

## Diseño técnico (borrador)

```
Plan base ACO (semana/día)
        ↓
   Contingencia (avería / contenedor crítico)
        ↓
   Estado de rutas en curso (carga, posición, jornada restante)
        ↓
   cheapest / regret insertion  ──►  ¿reasignable?
        │                                   │ no
        │ sí                                ▼
        ▼                           triage por criticidad (SLA)
   Plan alternativo estable ──────────────► ALNS (opcional)
        ↓
   Comparación vs re-solve ACO (estabilidad, km, tiempo)
```

## Dependencias

- Estado de rutas y paradas: `RouteWaypoint` (`pending`/`completed`), `OptimizedRoute.vehicle_id`.
- Estado de vehículo: `Vehicle.status`, capacidad (`vehicle_service`).
- Criticidad: `backend/app/domain/criticality.py`.
- Motor/base de comparación: `optimization_service.run_optimization_engine`.

## Criterios de aceptación

- [ ] Con flota justa, la capa de inserción **reasigna sin exceder** capacidad ni jornada.
- [ ] **Estabilidad del plan** medible: `1 − paradas reasignadas / paradas del plan`.
- [ ] **Tiempo de respuesta** documentado por contingencia (vs re-solve ACO).
- [ ] Comparación publicada en ≥3 escenarios (avería simple, avería sin flota, contenedor crítico).
- [ ] No modifica el plan base ni el fitness del ACO de producción.
- [ ] Tests: inserción (unit) + comparación baseline vs recuperación (integración).

## Narrativa para publicación

> «Frente a un re-solve completo del ACO, la capa de reinserción reduce las paradas movidas en
> X % y el tiempo de respuesta en Y×, con un incremento de Z % en distancia.»

## Referencias

- Decisión actual: [ADR-003](../fase-0/adr-contingencias.md)
- Código: `backend/app/services/contingency_service.py`,
  `backend/app/services/operational_recalc_service.py`,
  `backend/app/services/planning_service.py` (`compute_pending_priority`)
- Flujo: [plan-flujo-operativo.md](../plan-flujo-operativo.md) (Fase 3)
