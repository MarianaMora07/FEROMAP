# Estado de módulos — FEROMAP (matriz de trazabilidad)

| Campo | Valor |
|-------|-------|
| **Actualizado** | 2026-09-17 |
| **Alcance** | Módulos del frontend vs. fase de implementación y estado |
| **Relación** | [ux/arquitectura-navegacion.md](./ux/arquitectura-navegacion.md) define la IA destino; esta matriz indica qué está listo y qué falta |
| **Leyenda** | ✅ sólido · 🟡 parcial (funciona; sin e2e o backend incompleto) · 🧪 demo/mocks · ⚠️ duplicado/andamiaje |

## Matriz

| Módulo (ruta · etiqueta) | Fase IA | Estado | Evidencia / pendiente |
|---|---|---|---|
| `/` Dashboard (hub integrado) | 0–2 | ✅ | e2e `planner-dashboard` + `daily-planning` (hub). KPIs agregados por rol pendientes. |
| `/planning/weekly` Plan semanal (config base) | 1–3 | ✅ | **Config base**: zonas por día + flota por tipo. Validar → Aprobar → **Generar plan operativo** (tabla Camión × Día) → notificar por día/todo. e2e `daily-planning` + `weekly-operational` (motor real, lento). |
| `/optimization` Plan del día (tabs Optimizar/Resultados/Pendientes) | 1–4 | ✅ | Toolbar: Generar/Regenerar Plan Operativo + **Notificar a conductores** (aparece tras generar). Pendientes: cancelar antiguos / marcar ya visitado. e2e `daily-planning` (#pendientes) + `route-playback`. Los **parámetros del algoritmo** viven en `/settings`. |
| `/settings` Configuración (sección *Algoritmo*) | 13 | ✅ | Parámetros del motor (ACO, heurísticos, calibración) + **objetivo multiobjetivo** (equidad, makespan, mín. vehículos, jornada objetivo, rotación semanal). Vitest `optimizationObjectiveUx`. Antes era una pestaña de `/optimization`. |
| `/settings/calibration` Calibración del motor | 13 | ✅ | Consola de ambos barridos (sensibilidad ACO 18 corridas y pesos del objetivo) como **job asíncrono** con progreso `k/total`, ETA y cancelación; resultados desde caché con frontera de Pareto, AC-1/AC-2/AC-3 y export JSON/CSV. API `POST /benchmarks/*/jobs` + `GET /benchmarks/calibration/jobs/{id}` (`backend/docs/API.md`). Vitest `calibrationRunUx`, `calibrationSensitivityUx`, `calibrationObjectiveUx`, `calibrationExport`. |
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
| `/analytics` Analítica | — | ✅ | Visible en el menú; consume `analytics_service` real (summary + heatmap); estado vacío/error honesto; e2e estricto. |
| `/reports` Reportes | — | 🟡 | e2e estricto `analytics-reports`; export PDF/CSV sin e2e dedicado. |
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

## Línea base F0 (2026-09-11)

Medida sobre `main` tras el commit `d8adb74` (limpieza de copy "en vivo/telemetría"). Regenerar al cambiar seeds, flota o motor.

| Comando | Resultado | Nota |
|---|---|---|
| `npx tsc` | ❌ **81 errores en 43 archivos** | Deuda TS preexistente, extensa; Vite y Vitest no la tipan |
| `npm test` (Vitest) | ✅ 50 archivos / 272 tests | Verde (incluye F1/F3/F8) |
| `just test` (pytest) | ✅ 587 passed, 4 skipped | 150 s; contenedores arriba |
| subset e2e estable | ✅ `operational-map`, `demostracion`, `admin-demo-badges` | 5/5; `dark-mode-sidebar` es flaky (re-render del sidebar + capturas) |
| e2e estricto (sin mocks) | ✅ `npm run test:e2e:strict` | 10/10; perfil `playwright.strict.config.ts` |

## F1 — Fallback honesto (modo estricto)

Con `VITE_USE_MOCKS=false`, `withMockFallback` **propaga** el error de API en vez de devolver datos demo (`src/core/api/client.ts`). El modo mock (`VITE_USE_MOCKS=true`) sigue igual.

- **Estado honesto auditado:** dashboard, alerts, collection-points, case-studies, reports (error/vacío, sin demo) y optimization (ya lo tenía).
- **Perfil estricto:** `npm run test:e2e:strict` simula la caída de la API por vista y verifica que no aparece contenido demo.
- **Analytics:** muestra banner de error pero sigue inicializado con mocks (oculto del menú); su salida real es P6.
- **Pendiente (no auditado a fondo):** monitoring, map, drivers, vehicles, operator, route-playback y day-simulation también usan `withMockFallback`; en modo estricto pueden mostrar vacío o requerir manejo explícito.

## F2 — Seguridad y sesiones

- **Config unificada** (`backend/app/config.py`): un solo `settings`; `JWT_SECRET` sin default → con `APP_ENV=production` el arranque falla si falta (error explícito).
- **Hash por usuario** (`core/security.py`): salt aleatorio por hash + re-hash en login (`password_needs_rehash`); `verify_password` sigue leyendo hashes legados. Política de contraseñas (mín. 8) en `change_password`.
- **Sesión efectiva**: `validate_session` respeta `session_timeout_minutes` de la config operativa y revoca por inactividad.
- **Refresh rotativo**: access token corto (60 min) + refresh 7 días con rotación y detección de reuso (`/auth/refresh`); se guarda solo el hash del refresh en `user_sessions` (migración `029`).
- **Login**: lockout progresivo por email (`core/login_guard.py`) + rate-limit por IP en `main.py`.
- **CORS/cookie**: en producción CORS queda cerrado si no hay `CORS_ORIGINS`; la cookie lleva `Secure` automático en prod.
- **Pendiente**: el frontend aún no invoca `/auth/refresh`; el access token caduca a los 60 min sin renovación automática (follow-up).

## F3 — Observabilidad, superficie de error y CI

- **Logging JSON + request-id**: `backend/app/core/logging.py` + middleware en `main.py`; cada respuesta incluye `X-Request-ID` (se propaga si el cliente lo envía).
- **`/metrics`** (Prometheus, sin dependencias externas): `feromap_http_requests_total` (método/ruta/estado), histograma `feromap_http_request_duration_seconds`, gauges `feromap_optimization_jobs` / `feromap_optimization_queue`, y `feromap_frontend_errors_total`.
- **Superficie de error en prod**: `src/core/errors/errorReporter.ts` (toast global + reporte a `POST /api/v1/telemetry/frontend-error`) y handlers globales en `main.tsx`; `client.ts` reporta fallos ≥500.
- **CI**: `.github/workflows/ci.yml` (frontend: Vitest + tsc contra baseline 81; backend: pytest; e2e estricto).
- **`just prod-verify`**: `defense-verify` + `/metrics` + verificación de `X-Request-ID`.
- **Pendiente**: el job e2e estricto en CI queda como manual (`workflow_dispatch`) por su dependencia del stack con seed y caché del grafo.

## F4 — Acciones confiables (idempotencia + outbox)

- **Idempotencia**: tabla `idempotency_records` + helper `app/core/idempotency.py`; `dispatch_optimized_routes(..., idempotency_key=...)` reproduce la respuesta ante la misma `Idempotency-Key`. Los endpoints de despacho leen el header.
- **Outbox**: tabla `notification_outbox` + `notification_service` reescrito; entrega con reintentos y backoff exponencial, estados `queued/sent/failed/acked`, worker en background (`outbox_worker_enabled`) y `POST /notifications/outbox/process`.
- **Canales**: `webhook`, `smtp`, `whatsapp` y `webhook_mock` (fallback local). Configurable por env (`NOTIFICATION_CHANNELS`, `SMTP_*`, `WHATSAPP_WEBHOOK_URL`).
- **Historial, estado y acuse**: `GET /notifications/drivers/recent` (con intentos/error/sentAt/ackAt), `POST /notifications/{id}/ack` y panel `NotificationDeliveryPanel` en `/optimization`.
- **Flags de rollback**: `DISPATCH_IDEMPOTENCY_ENABLED`, `NOTIFICATIONS_OUTBOX_ENABLED` (en `false` → entrega única legacy, sin outbox).
- **Verificado en runtime**: doble POST con la misma clave → misma respuesta (no re-despacha); clave nueva → `count 0`; `idempotency_records` con estado `completed`.

## F5 (P5a) — Ejecución y datos (sin cambiar el rol del conductor)

- **Conciliación fina al cierre**: `plan_kpis.plan_vs_real_from_routes` desglosa completadas/saltadas/pendientes, **excluye los waypoints de vertedero** de los contenedores servidos y reporta **causa por incidencia** (`incidents.byType`) y motivos de visitas pendientes (`pendingVisitsByReason`). `close_daily_plan` recoge `VehicleIncident` y los motivos `not_visited`/`skipped_breakdown` y los persiste en `actualKpis`.
- **Retención/backup**: `just backup` (`pg_dump -Fc`, retención `BACKUP_KEEP`=14) y `just restore <archivo>`; política en [operaciones/retencion-backup.md](./operaciones/retencion-backup.md). `backups/` ignorado por git.
- **Avance masivo solo-demo**: `POST /routes/advance` queda detrás de `DEMO_ACTIONS_ENABLED` (auto: off en producción) y responde 403; el avance real es `POST /routes/{id}/advance` (explícito, escribe `actual_arrival_at`).
- **Fuera de alcance**: la confirmación de parada por el conductor depende de la decisión D.

## F6 — Analítica y reportes reales

- **Analítica sin mocks**: `features/analytics/index.tsx` ya no inicializa con datos mock; arranca vacío, consume `/api/v1/analytics/summary` y `/heatmap`, muestra estado vacío y error honesto, y queda **visible en el menú** (antes oculto 🧪).
- **Bugs corregidos en el endpoint oculto** `GET /analytics/planning`: `float(dict)` con el contrato de KPIs y falta de `.unique()` en un `joinedload` (`planning_analytics_service`).
- **KPIs agregados por rol**: `dashboard_service.role_kpis` + bloque `roleKpis` en el dashboard (administrador/planificador/conductor/residente).
- **Scoping de alertas**: `GET /alerts?sector=&vehicle=` con `alert_matches_scope` (coincidencia por límite de palabra, evita que "Unare I" matchee "Unare II").
- **e2e**: `e2e/strict/analytics-reports.spec.ts` cubre carga real y error honesto de analítica y reportes.

## Decisiones D (2026-09-11)

- **Operador editable (F5b): APROBADO, opt-in.** El conductor podrá confirmar paradas
  (visitada/omitida, con nota), **no** despachar ni cerrar el día, detrás de
  `OPERATOR_STOP_CONFIRMATION_ENABLED` (off por defecto) y con auditoría por parada e idempotencia.
  → [ADR-007](./fase-0/adr-007-operador-editable.md). Implementación en su propia fase F5b.
- **Ventanas por zona (F8): APROBADO.** F8 reemplaza la paridad de sector por configuración de
  ventana por parroquia/zona; sigue opt-in y desactivado por defecto. → [ADR-008](./fase-3/adr-008-ventanas-por-zona.md).

## F7 — Solver y contingencias (post-defensa)

Capa **comparativa y opcional**; no cambia el camino ACO por defecto. → [ADR-009](./fase-3/adr-009-baseline-ortools-y-recuperacion.md).

- **Heurísticas de recuperación** (`domain/vrp_heuristics.py`): `regret_insertion_cvrp` (regret-k) y
  `alns_cvrp` (mejora monótona sobre regret, determinista por semilla); `plan_stability_pct` mide
  estabilidad como Jaccard de arcos entre clientes.
- **Baseline OR-Tools** (`domain/ortools_baseline.py`): import perezoso; `available()` y
  `OrtoolsUnavailableError`. `ortools` queda como dependencia **opcional comentada** en `requirements.txt`
  → para el baseline exacto hace falta `pip install ortools` y reconstruir la imagen.
- **Flags sin efecto por defecto** (`config.py`): `SOLVER_BACKEND=aco`, `CONTINGENCY_STRATEGY=aco_resolve`;
  valores inválidos normalizan al default. `REGRET_K`, `ALNS_ITERATIONS`, `ALNS_SEED`, `ORTOOLS_*`.
- **Benchmark ampliado**: familias `regret`/`alns` (y `ortools` si está disponible) + `stabilityPct`;
  `just benchmark-algorithms` (135 corridas en ~14 s). Evidencia en `data/cache/benchmarks/algorithms_latest.json`.
- **Lo que queda diferido**: regret/ALNS aún **no** están cableados al servicio de contingencias
  (siguen como librería comparativa); multi-objetivo y VRPTW-en-OR-Tools siguen en backlog.

## F8 — Escala multi-zona y UX (post-defensa)

- **Zona configurable (parroquia):** `parishes.depot_*`, `landfill_*`, `time_window_start/end`
  (migración `031_parish_zone_config`); `zone_config_service` resuelve ventanas por sector y la
  parroquia de una corrida. API `GET /api/v1/parishes` + `PATCH /api/v1/parishes/{id}/zone` y panel
  **Zonas** en `/admin` (General). → [ADR-008](./fase-3/adr-008-ventanas-por-zona.md) · [zonas.md](./operaciones/zonas.md).
- **Fin de la paridad de sector:** `build_customer_time_windows(..., zone_windows=...)` usa la ventana
  configurada de la zona (sector sin ventana → sin restricción); la paridad queda solo como respaldo
  legado para llamadas sin configuración. `resolve_operational_facilities(..., parish_id=...)` prioriza
  depósito/vertedero de la zona.
- **i18n base (ES/EN):** `src/core/i18n/` con diccionarios y `t()`; la navegación y el shell usan
  claves (`labelKey`/`descriptionKey`, `SIDEBAR_SECTION_LABEL_KEYS`). El locale se sincroniza con la
  preferencia `language` del perfil. El copy de features migra de forma incremental.
- **a11y:** enlace **Saltar al contenido** + `main#main-content` (con `aria-labelledby="page-title"`),
  `aria-current="page"` en el enlace activo, `aria-expanded/aria-controls` en grupos del sidebar, y
  toasts con `role="status"` + `aria-live` y botón de cierre etiquetado. Ampliado en las fases de
  mejora 2–7 (focus trap, tabs ARIA, radios, `prefers-reduced-motion`, axe).
- **Diferido:** PWA offline (opcional) e i18n completa del copy de features.

## Mejoras UX/a11y — fases 0–7 (cierran la deuda del contrato de UI)

Ciclo de mejora ejecutado sobre el rol planificador. Fuente de verdad de reglas: [docs/design-system/contratos-ui.md](./design-system/contratos-ui.md).

- **F0 — Contratos:** reconciliación de la doc de IA con el código; contrato de tabs/foco/radios; `pt` retirado.
- **F1 — Confianza:** controles muertos fuera; `ConfirmDialog` en acciones destructivas; tendencias KPI por signo; campana sin destino eliminada (luego reasignada en F6); `<html lang>`.
- **F2 — Fundaciones a11y:** `useFocusTrap` (Modal/Drawer), sidebar `inert`, tabla ordenable con `aria-sort`, `aria-busy`/iconos decorativos, `prefers-reduced-motion`, radios de control.
- **F3 — Módulos:** tabs ARIA (`optimization`/`monitoring`), filtros con `label`, `role="img"` en gráficos, menú/overlays con Escape y clic-fuera, avisos `role="status"`.
- **F4 — Estados y feedback:** `ErrorState` con reintento, loading/empty/error uniformes, toasts globales, confirmación de «Aplicar» en Calibración, `h1#page-title` + `main aria-labelledby`.
- **F5 — i18n:** chrome y design-system completos en ES/EN (`ui.*`, `status.*`), `<html lang>`/`dir`.
- **F6 — Estructura:** subpaneles extraídos de `map`/`monitoring`; copy «demo» reformulado; retorno en Calibración; grupo colapsable robusto; campana del planificador → `/alerts`.
- **F7 — Verificación:** `e2e/a11y-planner.spec.ts` (axe) + `e2e/sidebar-permissions.spec.ts`; docs y checklist de cierre.

## Deuda conocida (no bloqueante)

0. **Tamaño de archivos de feature (F6).** `features/map/index.tsx` (~1037 líneas) y
   `features/monitoring/index.tsx` (~679) bajaron desde ~1420 y ~912 al extraer los subpaneles de UI
   (toolbar, paneles de capas/leyenda, overlays, tarjeta de mapa, lista de flota, barra de acciones).
   Lo que queda es **estado reactivo y ciclo de vida del mapa** (recursos, efectos, `syncOverlayLayers`),
   que permanece junto por corrección; extraerlo es un refactor mayor con riesgo de regresión en la
   demo. Justificación aceptada por el criterio de la fase.

1. **TypeScript:** `npx tsc` reporta 81 errores en 43 archivos (incl. `src/core/api/*`, `src/core/map/*`, `src/design-system/components/Table.tsx`, `src/features/vehicles/index.tsx`). Es deuda preexistente y amplia; `npm run build` y Vitest no la tipan. Cualquier criterio de "sin regresiones" debe compararse contra 81, no contra cero.
2. **e2e flaky:** el login vía `e2e/helpers/planner-session.ts` puede fallar con `socket hang up` bajo paralelismo, y `dark-mode-sidebar.spec.ts` (caso operador) falla al capturar el sidebar ("element is not attached to the DOM"). Pasan al reejecutarlos. `playwright.config.ts` activa `retries: 1` solo con `CI=true`.
3. **e2e estado-dependientes:** "muestra plan del día…" y "flujo completo: borrador…" en `daily-planning.spec.ts` (403/plan semanal) requieren `just db-reset && just seed`.
4. **e2e lentos:** `route-playback.spec.ts` (ACO <45 s) y `weekly-operational.spec.ts` (motor real, timeouts ~10 min, BD limpia).
5. **Scoping por sector/vehículo de alertas** para conductor/residente (hoy demo curado en frontend) — backlog post-grado.
6. **i18n parcial (F5):** traducidos el chrome (navegación/shell) y el **design-system**
   completo (`shell.*`, `ui.*`, `status.*`), incluidos `aria-label` y textos de Modal, Drawer,
   Header, Sidebar, UserMenu, AppShell, Table, ConfirmDialog, LoadingPanel, KpiCard y StatusBadge.
   El copy de las features sigue en español y migra de forma incremental. `<html lang>`/`dir` se
   sincronizan con el locale. PWA offline queda fuera de alcance (opcional).
7. **Seeds/fixtures asumen Unare:** la configuración por zona ya es real, pero el seed y varios
   fixtures siguen creando un único conjunto Unare; parametrizarlos es incremental.
