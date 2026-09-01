# Fase 12 — Casos de estudio aislados

**Estado:** Fase 12.2 completada (API CRUD)  
**Fecha inicio:** 2026-09-01

## Objetivo

Permitir **experimentos reproducibles** (casos de estudio) con subconjuntos de puntos, overrides de llenado/demanda y historial de simulaciones **sin contaminar** otros casos ni el catálogo global.

## Entregables Fase 12.0

| Entregable | Ubicación |
|------------|-----------|
| ADR (decisiones + aislamiento) | [adr-casos-estudio.md](./adr-casos-estudio.md) |
| Dominio Python (contrato puro) | `backend/app/domain/case_study.py` |
| Contrato TypeScript | `src/data/types/caseStudy.ts` |
| Diagrama ER | `docs/basededatos` (tablas `case_studies`, `case_study_points`) |

## Fases siguientes

| Fase | Alcance | Estado |
|------|---------|--------|
| **12.0** | ADR + contrato API/tipos + ER | ✅ Completada |
| **12.1** | Migración Alembic + seeds demo | ✅ Completada |
| **12.2** | CRUD `/case-studies` | ✅ Completada |
| **12.3** | Motor + `simulation.case_study_id` | Completada |
| **12.4** | UI editor de casos | Completada |
| **12.5** | Simulación + historial filtrado | Completada |
| **12.6** | Puente planificación semanal (opcional) | ✅ Completada |
| **12.7** | Evidencia para defensa | ✅ Completada |

## Matriz de aceptación Fase 12.0

| # | Criterio | Verificación |
|---|----------|--------------|
| 1 | ADR distingue `case_study` vs `scenario_id` | Lectura § Glosario y § Decisión 1 |
| 2 | Overrides no mutan `collection_points` | ADR § Decisión 2 |
| 3 | Prioridad: caso → request ids → todos active | ADR § Decisión 3; funciones `resolveOptimizationPointSource` |
| 4 | M:N punto ↔ caso documentado | ADR § Decisión 4; ER `case_study_points` |
| 5 | `simulations.case_study_id` nullable | ADR § Decisión 5; ER |
| 6 | Contratos TS y Python alineados | Tests de contrato (abajo) |

## Verificación Fase 12.0

```bash
# Backend — contrato puro (sin BD)
cd backend && python -m pytest tests/test_case_study_contract.py -v

# Frontend — contrato TypeScript
npm test -- src/data/types/caseStudy.test.ts
```

| Test | Verifica |
|------|----------|
| `test_resolve_point_source_priority` | Orden caso → request → legacy |
| `test_intersection_case_study_and_request_ids` | Intersección no vacía |
| `test_resolve_demand_with_overrides` | Override > fill override > catálogo |
| `test_normalize_case_study_code` | Código estable `CE-…` |
| `test_valid_status_and_scenario` | Enums de contrato |
| TS: mismos casos | Paridad Python ↔ TypeScript |

## Verificación Fase 12.1

```bash
just migrate
just seed
./scripts/compose.sh exec -T api pytest tests/test_case_study_schema.py -v
```

| Test | Verifica |
|------|----------|
| `test_case_study_tables_exist` | Tablas + `simulations.case_study_id` |
| `test_seed_loads_three_case_studies` | 3 casos demo en BD |
| `test_case_study_point_counts` | 15 + 15 + 12 puntos |
| `test_shared_point_in_multiple_case_studies` | M:N (CNT-006 en 3 casos) |
| `test_fk_rejects_*` | Integridad referencial |
| `test_cascade_delete_case_study_removes_memberships` | CASCADE |

## Verificación Fase 12.2

```bash
./scripts/compose.sh exec -T api pytest tests/test_case_study_service.py -v
```

| Test | Verifica |
|------|----------|
| `test_list_case_studies_filters_status` | GET listado con filtro |
| `test_create_case_study_draft` | POST borrador |
| `test_create_rejects_duplicate_code` | Código único |
| `test_get_detail_includes_points` | Detalle + puntos |
| `test_replace_points_and_reject_duplicates` | PUT points + dup |
| `test_patch_point_override` | PATCH override |
| `test_duplicate_case_study` | Clonación |
| `test_geojson_returns_active_features` | GeoJSON mapa |

Endpoints (`PlannerOrAdmin`): `/api/v1/case-studies`

## Guion evaluador (2 min, sin código)

1. **«¿Qué es un caso de estudio?»** — Subconjunto nombrado de contenedores para un experimento de tesis (CE-UNARE-NORTE).
2. **«¿En qué se diferencia de escenario lluvia/normal?»** — El caso define *qué puntos*; el escenario define *clima/tráfico global*.
3. **«¿Puede un contenedor estar en dos casos?»** — Sí, con llenados distintos por caso, sin duplicar el contenedor en BD.
4. **«¿Qué pasa si no elijo caso?»** — Comportamiento actual: todos los puntos activos.

## Referencias cruzadas

- Capítulo metodología: casos de estudio comparables.
- `POST /simulations/optimize` — hoy acepta `collectionPointIds`; Fase 12.3 añade `caseStudyId`.
- Plan semanal — Fase 12.6: `weekly_plans.case_study_id` + resolución de puntos/overrides del caso en validación y optimización diaria.

## Verificación Fase 12.6

```bash
just migrate
./scripts/compose.sh exec -T api pytest tests/test_planning_case_study.py -v
```

| Test | Verifica |
|------|----------|
| `test_weekly_plan_resolves_points_from_case_study` | Días laborables heredan puntos activos del caso |
| `test_weekly_plan_case_study_columns_exist` | Columnas FK en `weekly_plans` / `weekly_plan_days` |
| `test_get_weekly_plan_payload_includes_case_metadata` | API expone `caseStudyId`, `pointSource` |

## Verificación Fase 12.7

| Evidencia | Comando / artefacto |
|-----------|---------------------|
| Aislamiento A vs B | `just test-case-study-isolation` |
| Reporte por caso | `just case-study-report CE-UNARE-NORTE` |
| Tabla comparativa | `just phase12-evidence` → [evidencia-casos-estudio.md](./evidencia-casos-estudio.md) |
| Guion oral (3 min) | [guion-defensa-casos-estudio.md](./guion-defensa-casos-estudio.md) |

```bash
just test-case-study-isolation
just case-study-report CE-UNARE-NORTE
just phase12-evidence
```
