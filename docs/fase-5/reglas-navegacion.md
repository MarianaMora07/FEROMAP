# Reglas de navegación — Simulación vs Planificación operativa

Documento para futuros cambios de producto y frontend (Opción A).

> **Reconciliación (2026-09-24):** la IA vigente es
> [ux/arquitectura-navegacion.md](../ux/arquitectura-navegacion.md) — la **operación** es
> primaria y la Simulación ACO (tesis) vive oculta en el grupo «Tesis y demostración».
> La sección «Jerarquía» de abajo refleja el ADR-001 (histórico); las **reglas al añadir
> funcionalidad** son la fuente de verdad vigente.

## Jerarquía

1. **CTA primario del Dashboard** → `/simulation` (Nueva simulación).
2. **Menú lateral** → Simulación aparece antes que Planificación operativa.
3. **Planificación operativa** → CTA secundario en Dashboard y enlace desde banner de Simulación.

## Banners de orientación (reconciliado en Fase 0 · 2026-09-24)

Regla: cada módulo ambiguo debe ofrecer una salida clara al módulo hermano. La
implementación real **no** es un único componente genérico: el
`ModuleGuidanceBanner` queda reservado a la Demostración y la orientación de
Optimización/Simulación usa componentes de contexto.

| Pantalla | Componente real | Copy / destino |
|----------|-----------------|----------------|
| `/optimization` | `DailyScenarioBanner` | «Situación del día»: escenario heredado del plan semanal y pendientes (solo lectura). |
| `/optimization` | `OptimizationHeaderBar` | Chip «Experiencia del día» (Drawer), navegación `‹ ›`/fecha + chip de estado + chip de nivel e **indicador de notificación** («Conductores notificados · N rutas»; el despacho es automático). Las herramientas secundarias (Simular día (dry-run), Contingencia, Reenviar, PDF, mapa, historial) viven en ⋯. |
| `/optimization` | `OptimizationContextBand` (BDC) | **Una sola** banda por prioridad: error · semana sin aprobar → «Ir al Plan semanal» · despacho → «Ir a monitoreo» · cierre del día. |
| `/simulation` | `PlanningContextualCta` (`SimulationResultsStep`) | «Plan semanal aprobado — lleva el escenario al plan operativo del día» → `/optimization` |
| `/demostracion` | `ModuleGuidanceBanner` | «¿Quieres evaluar escenarios completos?» → `/simulation`; «Demostración didáctica — no es simulación de tesis» → `/simulation` |

Implementación: `src/features/shared/ModuleGuidanceBanner.tsx` (solo
`/demostracion`) · `src/features/planning/PlanningContextualCta.tsx` ·
`src/features/optimization/DailyScenarioBanner.tsx` ·
`src/features/optimization/OptimizationDispatchBanner.tsx` (exporta `OptimizationContextBand`, la BDC).

> **Nota de reconciliación:** los copies literales «¿Quieres evaluar escenarios?»
> (en `/optimization`) y «¿Quieres despachar rutas de hoy?» (en `/simulation`)
> de la versión anterior **no** existen en el código; la orientación actual es la
> de la tabla. Recuperar esos copies exactos, si se desea, es trabajo de la Fase 6
> (navegación fina). El patrón de tabs y los contratos de foco/radio viven en
> [docs/design-system/contratos-ui.md](../design-system/contratos-ui.md).

## Deep links existentes (no mezclar responsabilidades)

| Ruta | Uso |
|------|-----|
| `/simulation?simulationId=` | Abrir resultados de evaluación de tesis |
| `/simulation?view=history` | Historial completo de simulaciones |
| `/analytics?simulationId=` | Analítica con contexto de simulación |
| `/reports?simulationId=` | Reportes con contexto de simulación |
| `/demostracion` | Demostración didáctica del ACO (laberinto) — no evaluación ni despacho |

No enlazar el historial operativo de `/optimization` como sustituto del historial de tesis.

## Reglas al añadir funcionalidad

1. **Antes de añadir un control**, preguntar: ¿es didáctica ACO (Demostración), evaluación de escenario (Simulación) u operación del día (Optimización)?
2. **No duplicar formularios**: si un campo ya existe en Simulación con propósito de tesis, no copiarlo en Optimización sin justificación operativa.
3. **Historial**: las corridas desde `/optimization` deben llamar a `recordOperationalRun(simulationId)`; Simulación usa el listado API completo.
4. **Despacho**: solo en Planificación operativa; Simulación redirige con banner/enlace.
5. **Previsto vs. real y KPIs de impacto** *(regla canónica)*: el **previsto** (línea base del turno vs. plan, desglose y rutas por vehículo) vive en la pestaña **Plan**; los **resultados reales** (previsto vs. real, cumplimiento) solo aparecen en la pestaña **Resultados** cuando el día está **cerrado** (`partial`/`closed`). La comparación de tesis (baseline vs ACO entre escenarios) sigue siendo de `/simulation`; el tab `Plan` habla de «línea base del turno», no de evaluación académica.
6. **Cambios de menú o CTA**: actualizar este documento y `docs/fase-5/matriz-responsabilidades-modulos.md`.

## Anti-patrones (evitar)

- Fusionar ambos módulos en una sola pantalla sin ADR nuevo.
- Mostrar el mismo historial en Simulación y Optimización sin filtrar origen.
- Añadir «despachar» en Simulación como acción primaria.
- Renombrar `/optimization` en la URL (mantener por compatibilidad; copy = «Planificación operativa»).
- Mezclar el laberinto didáctico en Simulación o Optimización (usar `/demostracion`).

## Referencias

- [ADR-001](../fase-0/adr-001-simulacion-principal.md)
- [matriz-responsabilidades-modulos.md](./matriz-responsabilidades-modulos.md)
- Código: `simulationStore.ts`, `optimizationStore.ts`, `operationalHistory.ts`
