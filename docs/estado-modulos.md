# Estado de módulos — FEROMAP (matriz de trazabilidad)

| Campo | Valor |
|-------|-------|
| **Actualizado** | 2026-09-06 |
| **Alcance** | Módulos del frontend vs. fase de implementación y estado |
| **Relación** | [ux/arquitectura-navegacion.md](./ux/arquitectura-navegacion.md) define la IA destino; esta matriz indica qué está listo y qué falta |
| **Leyenda** | ✅ sólido · 🟡 parcial (funciona; sin e2e o backend incompleto) · 🧪 demo/mocks · ⚠️ duplicado/andamiaje |

## Matriz

| Módulo (ruta · etiqueta) | Fase IA | Estado | Evidencia / pendiente |
|---|---|---|---|
| `/` Dashboard (hub integrado) | 0–2 | ✅ | e2e `planner-dashboard` + `daily-planning` (hub). KPIs agregados por rol pendientes (bloque `showAdminOverview` histórico). |
| `/planning/weekly` Plan semanal (config base) | 1–3 | ✅ | **Config base**: zonas por día + flota por tipo. Validar → Aprobar → **Generar plan operativo** (tabla Camión × Día) → notificar por día/todo. e2e `daily-planning` + `weekly-operational` (motor real, lento). |
| `/optimization` Plan del día (tabs Optimizar/Pendientes) | 1–4 | ✅ | Toolbar: Generar/Regenerar Plan Operativo + **Notificar a conductores** (aparece tras generar). Pendientes: cancelar antiguos / marcar ya visitado. e2e `daily-planning` (#pendientes) + `route-playback`. |
| `/planning/history` Historial unificado | 0–2 | ✅ | e2e `daily-planning`. |
| `/monitoring` Monitoreo (tabs Mapa en vivo / Incidencias) | 2–4 | 🟡 | e2e básico de tabs OK; avance de flota usa "demo" que muta BD; e2e profundo pendiente. |
| `/map` Mapa GIS | — | ✅ | e2e `operational-map` + residente. |
| `/vehicles` Vehículos | 1 | ✅ | e2e `catalog-planner`. Pestaña **Territorio** (sectores preferentes por conductor/vehículo); el motor usa territorio solo si cubre el día completo, si no ACO global. |
| `/drivers` Conductores | 1 | 🟡 | e2e `catalog-planner` (nuevo). Backend sin DELETE. |
| `/collection-points` Puntos de Recolección | 1 | 🟡 | CRUD completo; e2e `resident-flow` (rol residente) + `catalog-planner` (nuevo, rol planner). |
| `/alerts` Alertas | 1–5 | 🟡 | Gate backend alineado (lectura: rol autenticado; mutación: planner/admin). Conductor/residente consumen demo curado (scoping por sector/vehículo pendiente en backend). |
| `/simulation` Simulación ACO | 1–3 | ✅ | e2e `simulation-execution`; sin restos de plan semanal. |
| `/case-studies` Casos de estudio | 1 | 🟡 | API ✅ (phase-a usa casos); sin e2e de UI dedicado. |
| `/demostracion` Demostración ACO | 1 | ✅ | e2e `demostracion`. |
| `/analytics` Analítica | — | 🧪 | Oculto del menú; mocks "fuera del guion de defensa"; KPIs reales → Dashboard/Reportes (post-grado). |
| `/reports` Reportes | — | 🟡 | Sin e2e dedicado; mock fallback parcial. |
| `/admin` Administración | 4 | 🟡 | Tabs finales General/Usuarios/Auditoría sin "Próximamente"; sin e2e dedicado. |
| `/operator` (+ `/operator/plan`) Conductor | — | ✅ | e2e `operator-flow` + phase-a. |
| `/resident` Residente | — | ✅ | e2e `resident-flow`. |
| `/profile` Perfil | — | 🟡 | Endpoints completos; sin e2e. |

## Catálogo transversal (componentes no-ruta)

| Pieza | Estado | Nota |
|---|---|---|
| `contingency`, `landfill`, `route-playback`, `shared` | ✅ | Bibliotecas embebidas en monitoreo/operador/optimización/simulación. |
| `features/planning/weekly/WeeklyPlan*` | ✅ | Migrados desde `simulation` (Fase 3); incluye `WeeklyPlanFleetEditor` (flota por tipo), `WeeklyPlanOperationalSection` (generar semana + tabla Camión × Día + notificar). |
| `features/vehicles/VehicleTerritoryPanel` | ✅ | Territorio sector→conductor configurable por vehículo (pestada Territorio). |
| `features/case-studies/CaseStudySelector` | ✅ | Movido a su dominio (Fase 3). |

## Deuda conocida (no bloqueante)

1. Tests unitarios preexistentes rotos: `src/core/stores/simulationStore.test.ts` (mock de `appStore` sin export `setRoutes`).
2. e2e dependientes del estado del seed/backend local: "muestra plan del día…" y "flujo completo: borrador…" en `daily-planning.spec.ts` (403/plan semanal). Requiere `just db-reset && just seed` y revisar cambios sin commit en `backend/`.
3. e2e `route-playback.spec.ts`: requiere que el motor ACO complete en <45 s (lento en dev).
4. e2e `weekly-operational.spec.ts`: flujo completo con motor real (validar + generar semana) → requiere timeouts amplios (~10 min); correr con BD limpia (`just db-reset && just seed`).
5. Scoping por sector/vehículo de alertas para conductor/residente (hoy demo curado en frontend) — backlog post-grado.
5. `src/core/api/*` (analytics, collectionPoints, dashboard) tiene errores TS preexistentes asociados a cambios locales sin commit.
6. Errores TS preexistentes no bloqueantes: `OptimizationResultsCompact` (huérfano) y `Card id` en `PendingManagementPanel`; el build no los tipa.
