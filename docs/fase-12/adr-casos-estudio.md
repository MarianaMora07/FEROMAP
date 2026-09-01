# ADR-005: Casos de estudio aislados para simulación y optimización

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado (Fase 12.0 — contrato) |
| **Fecha** | 2026-09-01 |
| **Fase** | 12 — Casos de estudio (experimentos reproducibles) |
| **Implementación BD/API/motor** | Fases 12.1–12.3 |
| **Contrato código** | `backend/app/domain/case_study.py`, `src/data/types/caseStudy.ts` |

## Contexto

Hoy FEROMAP distingue **escenarios climáticos/de tráfico** (`scenario_id`: `normal`, `rain`, `saturated`, …) pero **no** modela **casos de estudio** como conjuntos experimentales independientes.

Problemas actuales:

1. Sin `caseStudyId`, el motor carga **todos** los `collection_points` con `status=active`.
2. El llenado (`current_fill_level_kg`) vive en el catálogo global → simular un perfil “saturado” en un subconjunto **contamina** otros experimentos.
3. No hay relación **M:N** punto ↔ caso: un mismo contenedor no puede participar en CE-1 y CE-2 con condiciones distintas.
4. El historial de `simulations` no enlaza la corrida a un experimento nombrado (solo a `scenario_name` + JSON).

Para la defensa se necesitan **casos de estudio reproducibles** (CE-UNARE-NORTE, CE-MULTI-VIAJE, …) donde el evaluador compare comportamiento del ACO **sin mezclar datos ni resultados**.

## Glosario

| Término | Significado |
|---------|-------------|
| **Caso de estudio** (`case_study`) | Experimento acotado: subconjunto de puntos + overrides opcionales + defaults de simulación. Identificador estable (`code`, ej. `CE-UNARE-NORTE`). |
| **Escenario operativo** (`scenario_id`) | Perfil de **tráfico/clima/demanda global** (`normal`, `rain`, `saturated`, …). No define qué puntos entran. |
| **Simulación** (`simulation`) | Una **ejecución** del motor con KPIs y rutas persistidas. Puede referenciar opcionalmente un caso de estudio. |
| **Catálogo global** | Tabla `collection_points`: ubicación, sector, capacidad, llenado “real” del sistema. **Verdad física** del contenedor. |
| **Override de caso** | Valor en `case_study_points` que **sustituye** llenado/demanda **solo durante** una corrida ligada al caso. No modifica el catálogo. |
| **Membresía M:N** | Un punto puede estar en N casos; un caso agrupa M puntos. |

## Decisiones cerradas

### 1. `case_study` ≠ `scenario_id`

| Concepto | Pregunta que responde | Ejemplo |
|----------|----------------------|---------|
| `case_study` | **¿Qué puntos** y **con qué condiciones locales** entran al experimento? | CE-1: 40 puntos norte, llenado alto en 5 contenedores |
| `scenario_id` | **¿Qué condiciones globales** de red/demanda aplican? | `rain` → tráfico ×1.2; `saturated` → fill boost |

Ambos pueden combinarse: *Caso CE-MULTI-VIAJE* + escenario `saturated`.

**Regla:** renombrar en UI para evitar confusión:

- UI: **«Caso de estudio»** / **«Condiciones climáticas»** (no ambos como «escenario»).

### 2. Catálogo global vs overrides del caso

| Capa | Fuente | Mutable en simulación |
|------|--------|------------------------|
| Coordenadas, sector, código, capacidad máxima | `collection_points` | No (Fase 12) |
| Llenado / demanda por defecto | `collection_points.current_fill_level_kg` | No durante corrida con caso |
| Llenado / demanda del experimento | `case_study_points.fill_level_kg_override` / `demand_kg_override` | Sí, solo en filas del caso |

**Resolución de demanda al optimizar** (por punto del caso):

```
si demand_kg_override != null  → usar override
si no, si fill_level_kg_override != null → demand = min(capacity, override)
si no → demand desde collection_points (fill + boosts del scenario_id)
```

Los overrides se aplican **en memoria** en el motor (Fase 12.3). **Nunca** se escribe en `collection_points` al simular.

### 3. Prioridad al armar la instancia VRP

Orden estricto (primera fuente que aplique gana):

```
1. case_study_points   (si caseStudyId presente y punto active_in_study=true)
2. collectionPointIds  (lista explícita en POST /simulations/optimize)
3. collection_points   (todos status=active, deleted_at IS NULL)  ← comportamiento legacy
```

**Interacción `caseStudyId` + `collectionPointIds`:**

- Si vienen **ambos**, la intersección debe ser no vacía; el motor usa  
  `case_study_points ∩ collectionPointIds`.
- Si solo `caseStudyId`, usa todos los miembros activos del caso.

**Sectores:** un punto tiene un único `sector_id` en catálogo. Acotar por sector en un caso se hace **incluyendo puntos** en `case_study_points`, no duplicando sectores.

### 4. Membresía M:N

Tabla puente `case_study_points`:

- PK compuesta `(case_study_id, collection_point_id)`.
- Un punto puede aparecer en **varios** casos con overrides distintos.
- `active_in_study=false` excluye el punto **solo** de ese caso (no del catálogo).

### 5. Simulaciones y compatibilidad legacy

- `simulations.case_study_id` **nullable** (FK → `case_studies.id`).
- Corridas sin caso (`null`) siguen siendo válidas (modo actual).
- `parameters_json` incluirá en Fase 12.3: `caseStudyId`, `caseStudyCode`, `pointSource`, ids de puntos resueltos.

### 6. ACO sin cambio de objetivo

Al igual que ADR-003 y ADR-004, el **fitness del ACO sigue siendo distancia**. Los casos de estudio acotan **instancia** (clientes, demandas) y **parámetros**; no alteran la función objetivo.

## Modelo de datos (contrato Fase 12.1)

```text
case_studies
  id, code (unique), name, description
  default_scenario_id varchar(50) default 'normal'
  default_parameters_json text nullable
  status enum draft|active|archived
  created_at, updated_at, deleted_at

case_study_points
  case_study_id FK, collection_point_id FK  [PK compuesta]
  active_in_study boolean default true
  fill_level_kg_override decimal nullable
  demand_kg_override decimal nullable
  notes text nullable
  sort_order integer nullable

simulations
  + case_study_id FK nullable
```

### `default_parameters_json` (shape acordado)

Campos opcionales; mismos nombres camelCase que `OptimizeRequest` donde aplique:

```json
{
  "operatorsShortage": 0,
  "acoAnts": 12,
  "acoIterations": 20,
  "priorityFillLevel": false,
  "timeWindowEnabled": false,
  "estimatedDurationHours": 12
}
```

Precedencia al optimizar: **request** > **default del caso** > **defaults del servidor**.

## Contrato API (Fase 12.2 — preview)

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/case-studies` | planificador+ |
| POST | `/case-studies` | planificador+ |
| GET | `/case-studies/{id}` | planificador+ |
| PATCH | `/case-studies/{id}` | planificador+ |
| PUT | `/case-studies/{id}/points` | planificador+ |
| POST | `/simulations/optimize` | + campo `caseStudyId` |

## Ejemplos numéricos de aislamiento

**Punto CNT-003** en dos casos:

| Caso | fill_level_kg_override | Demanda resuelta (cap 1000 kg) |
|------|------------------------|--------------------------------|
| CE-UNARE-NORTE | null (usa catálogo 400 kg) | 400 kg |
| CE-SATURADO | 900 | 900 kg |

Misma coordenada, **distinta instancia VRP** → rutas y KPIs comparables solo **dentro** de cada caso.

**Historial:**

| simulation_id | case_study_id | scenario_id | Puntos |
|---------------|---------------|-------------|--------|
| 101 | 1 (CE-NORTE) | normal | 20 |
| 102 | 2 (CE-SUR) | saturated | 25 |
| 103 | null | normal | 20 (legacy) |

## Matriz aislamiento vs contaminación

| Acción | ¿Contamina otro caso? | ¿Contamina catálogo? |
|--------|----------------------|----------------------|
| Simular CE-1 | No (rutas/KPIs propios) | No |
| Override llenado en CE-1 | No en CE-2 | No |
| PATCH `collection_points` llenado global | Sí (afecta casos sin override) | Sí |
| Cambiar `scenario_id` en request | No entre casos | No |

## Consecuencias

| Fase | Alcance |
|------|---------|
| **12.0** | ADR + contratos TS/Python + ER en `docs/basededatos` |
| **12.1** | Migración Alembic + seeds demo |
| **12.2** | CRUD API |
| **12.3** | Motor: resolución de puntos + `simulation.case_study_id` |
| **12.4** | UI editor de casos |
| **12.5** | Simulación + historial filtrado |
| **12.6** | Puente `weekly_plans.case_study_id` (opcional) |

## Criterio de aceptación Fase 12.0

Un evaluador lee este ADR y entiende:

1. Por qué **caso de estudio** y **escenario climático** son conceptos distintos.
2. Cómo un mismo punto puede tener **condiciones distintas** en CE-1 y CE-2 sin duplicar filas en `collection_points`.
3. Qué ocurre si no se pasa `caseStudyId` (modo legacy: todos los activos).
4. Que simular un caso **no debe escribir** overrides en el catálogo global.

## Referencias

- [README Fase 12](./README.md)
- [ADR-003 Dotación](../fase-8/adr-dotacion-tiempo-servicio.md)
- [ADR-004 Vertedero](../fase-9/adr-vertedero-multi-viaje.md)
- `docs/basededatos` — tablas `case_studies`, `case_study_points`
- `backend/app/schemas/simulation.py` — `OptimizeRequest.collection_point_ids`
