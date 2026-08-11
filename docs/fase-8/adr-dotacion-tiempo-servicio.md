# ADR-003: Dotación de cuadrilla y tiempo de servicio en paradas

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado (Fase 0 — contrato) |
| **Fecha** | 2026-08-11 |
| **Fase** | 8 — Realismo operativo (tiempo en paradas) |
| **Implementación motor** | Fases 1–2 |
| **Contrato código** | `backend/app/domain/crew_service_time.py`, `src/data/types/crewServiceTime.ts` |

## Contexto

Hoy el VRP/ACO modela:

- **Demanda** por contenedor (kg / nivel de llenado)
- **Capacidad** por vehículo (kg)
- **Tiempo de ruta** ≈ solo desplazamiento entre puntos (matriz vial × velocidad)

En la operación real, cada parada consume tiempo de vaciado que depende de **cuántos operarios de campo** trabajan en el camión. La BD ya tiene `vehicles.ideal_operators_count`, pero **no se usa en el motor**.

Para la defensa hace falta explicar por qué dos corridas con la **misma distancia** pueden tener **duración distinta** — y por qué eso puede implicar **otra jornada de trabajo**.

## Decisiones cerradas

### 1. Objetivo del ACO vs reporte operativo

| Capa | Qué minimiza / reporta |
|------|-------------------------|
| **ACO + 2-opt** | **Distancia recorrida** (metros en la red vial). El fitness de la metaheurística **no** incluye tiempo de servicio en paradas. |
| **KPIs y rutas persistidas** | **Tiempo total operativo** = tiempo de viaje + tiempo en paradas según dotación. |

**Consecuencia:** cambiar solo la dotación **no debe cambiar** la secuencia óptima de paradas (misma semilla → misma ruta en distancia), pero **sí** los KPIs de duración y `estimatedDurationSeconds`. Eso modela el riesgo de «la ruta sigue siendo corta en km pero ya no cabe en el turno».

### 2. Dotación: por vehículo + ausentismo global en simulación

| Nivel | Campo | Rol |
|-------|-------|-----|
| **Por vehículo (BD)** | `idealOperatorsCount` | Dotación de referencia del camión (default **6**). |
| **Por vehículo (BD)** | `assignedOperatorsCount` | Cuadrilla que salió hoy con ese camión (`1…ideal`). Si es `null`, se asume dotación completa. |
| **Simulación (request)** | `operatorsShortage` | Ausentismo del **turno**: operarios de campo que faltan globalmente (`0…5`). Se resta de la dotación asignada de cada vehículo antes del cálculo. |

**Resolución efectiva por vehículo:**

```
assignedEfectivo = max(1, assignedVehículo − operatorsShortage)
```

El conductor **no** se resta con `operatorsShortage` (ver decisión 3).

### 3. Conductor dentro de la dotación

- `idealOperatorsCount = 6` significa **1 conductor + 5 operarios de campo**.
- El conductor **siempre está** en el camión (`assigned ≥ 1`).
- La penalización por personal faltante aplica solo a los **operarios de campo** (máximo 5).

## Fórmulas

Constantes (contrato):

| Constante | Valor |
|-----------|-------|
| `DEFAULT_IDEAL_OPERATORS` | 6 |
| `FIELD_OPERATORS_PER_VEHICLE` | 5 |
| `BASE_SERVICE_SECONDS` | 300 (5 min por punto, dotación completa) |
| `PENALTY_PER_MISSING_FIELD_OPERATOR_SEC` | 30 |

Por vehículo:

```
fieldIdeal     = idealOperators − 1
fieldAssigned  = max(0, assignedEfectivo − 1)
missingField   = max(0, fieldIdeal − fieldAssigned)

serviceTimeSec = BASE_SERVICE_SECONDS + missingField × PENALTY_PER_MISSING_FIELD_OPERATOR_SEC
```

Duración de una ruta con `n` paradas (clientes, sin depósito):

```
durationSec = travelSec + n × serviceTimeSec
```

## Ejemplos numéricos

Supuesto: ruta con **5 paradas**, **tiempo de viaje = 40 min** (2 400 s), dotación ideal 6.

| Caso | assigned | shortage | Operarios campo | Faltantes | s/punto | Tiempo paradas | **Total** |
|------|----------|----------|-----------------|-----------|---------|----------------|-----------|
| Turno completo | 6 | 0 | 5 | 0 | 300 | 25 min | **65 min** |
| Falta 1 operario en camión | 5 | 0 | 4 | 1 | 330 | 27,5 min | **67,5 min** |
| Ausentismo turno (−2 campo) | 6 | 2 | 3 | 2 | 360 | 30 min | **70 min** |
| Solo conductor | 1 | 0 | 0 | 5 | 450 | 37,5 min | **77,5 min** |

**Misma distancia en los cuatro casos** (misma secuencia ACO); **duración distinta** en KPIs.

Con jornada de referencia de 8 h (480 min), el último caso acerca la operación al límite solo en paradas + viaje, ilustrando «otro día de trabajo» si se encadenan más puntos o más viaje.

## Matriz objetivo vs reporte

| Artefacto | Distancia | Tiempo viaje | Tiempo paradas | ¿Usa dotación? |
|-----------|-----------|--------------|----------------|----------------|
| Fitness ACO / 2-opt | ✅ minimiza | indirecto (matriz) | ❌ | ❌ |
| `_compute_kpis.durationHours` | — | ✅ (Fase 2) | ✅ (Fase 2) | ✅ |
| `optimized_routes.estimated_duration_seconds` | — | ✅ (Fase 2) | ✅ (Fase 2) | ✅ |
| GeoJSON / mapa (opcional) | ✅ | ✅ | badge dotación | ✅ |

## Contrato API (Fase 0)

### Vehículos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `idealOperatorsCount` | int | Dotación ideal (default 6). Ya expuesto en GET. |
| `assignedOperatorsCount` | int \| null | Cuadrilla hoy (Fase 1: persistencia PATCH). |

### Simulación — `POST /simulations/optimize`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `operatorsShortage` | int 0–5 | Operarios de **campo** ausentes en el turno. Se persiste en `simulationParameters`; **motor Fase 2**. |

### Respuesta KPI (Fase 2)

Se documentará desglose opcional:

```json
{
  "durationHours": { "current": 4.2, "optimized": 3.1 },
  "durationBreakdown": {
    "optimized": {
      "travelHours": 2.4,
      "serviceHours": 0.7,
      "crewLabel": "4/6 (conductor + 3 operarios)"
    }
  }
}
```

## Consecuencias

- **Fase 1:** migración `assigned_operators_count`, default `ideal_operators_count = 6`, PATCH vehículo.
- **Fase 2:** aplicar fórmulas en KPIs y persistencia; ACO sin cambios de objetivo.
- **Fase 3:** toggle «Ausentismo del turno» en `/simulation` → `operatorsShortage`.
- **Tests:** funciones puras en `crew_service_time` (Python + TS).

## Criterio de aceptación Fase 0

Un evaluador lee este ADR y entiende:

1. Por qué la **distancia optimizada puede ser idéntica** con distinta dotación.
2. Por qué la **duración reportada no** — y por qué eso importa operativamente.
3. Qué campos API usará la UI en las fases siguientes.

## Referencias

- [README Fase 8](./README.md)
- `docs/basededatos` — `vehicles.ideal_operators_count`
- [ADR-002](./adr-002-progreso-ejecucion-simulacion.md) — jobs y progreso de ejecución
