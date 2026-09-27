# Checklist de cierre — mejoras UX/a11y del planificador (fases 0–7)

| Campo | Valor |
|-------|-------|
| **Estado** | Cerrado (pendiente de aprobación de Victor/Mariana) |
| **Fecha** | 2026-09-24 |
| **Alcance** | Rol **planificador/administrador** del frontend (SolidJS) |
| **Fuente de verdad** | [docs/design-system/contratos-ui.md](./contratos-ui.md) |
| **Navegación** | [docs/ux/arquitectura-navegacion.md](../ux/arquitectura-navegacion.md) |

## Criterio de aceptación global

- Sin violaciones **axe `critical`/`serious`** en las rutas primarias del planificador.
- **Doc = código**: navegación, contratos y estado de módulos reflejan la implementación.

## Fase 0 — Preparación y contratos

- [x] Doc de IA reconciliada con el código (Analítica visible; banners de orientación).
- [x] Contrato único de **tabs ARIA**, **foco** (Modal/Drawer/overlays) y **radios**.
- [x] `pt` retirado (D-0.1).
- [x] Política de verificación a11y definida (axe en F7).
- Docs: `contratos-ui.md` · `arquitectura-navegacion.md` · `reglas-navegacion.md`.

## Fase 1 — Correcciones de confianza

- [x] Controles muertos fuera (Reportes: Ver/Eliminar; campana sin destino).
- [x] `ConfirmDialog` en «Cerrar día» y «Archivar» (semanal).
- [x] Tendencias KPI por signo del delta.
- [x] `<html lang>` sincronizado con el locale.

## Fase 2 — Fundaciones de accesibilidad

- [x] `useFocusTrap`: trap de `Tab`, `Escape` solo con overlay abierto, restauración al trigger.
- [x] Sidebar móvil cerrado con `inert`.
- [x] Tabla: cabecera ordenable como botón con `aria-sort`/`scope`; `selectable` retirado.
- [x] `Button`: `aria-busy` + iconos decorativos `aria-hidden`.
- [x] `prefers-reduced-motion` global; radios de control unificados (`--radius-md`).

## Fase 3 — Accesibilidad por módulo

- [x] Tabs ARIA en `optimization` y `monitoring` (`TabList` + panel).
- [x] Filtros con `label`/`aria-label` (reports, analytics, monitoring).
- [x] Gráficos Chart.js con `role="img"` + `aria-label`.
- [x] Menú «Más acciones» y overlays del mapa: `role`/`aria-expanded`/`aria-controls`, Escape y clic-fuera.
- [x] Avisos asíncronos en `role="status"`.

## Fase 4 — Consistencia de estados y feedback

- [x] `ErrorState` con reintento; loading/empty/error uniformes (reports, analytics, history).
- [x] Toast global para éxito/error (settings, calibración, optimization).
- [x] `ConfirmDialog` antes de «Aplicar» en Calibración.
- [x] Un solo `h1` por página (`#page-title`) + `main aria-labelledby="page-title"`.

## Fase 5 — i18n

- [x] Chrome y design-system en ES/EN (`ui.*`, `status.*`, `shell.subtitle.*`).
- [x] Paridad de claves por tipo (`en: Record<MessageKey, string>`) + test.
- [x] `<html lang>` y `dir` sincronizados.
- Deuda: copy de **features** sigue en ES (migración incremental).

## Fase 6 — Deuda estructural y navegación fina

- [x] Subpaneles extraídos de `map/index.tsx` (→1037) y `monitoring/index.tsx` (→679).
- [x] Copy «demo» reformulado («Avance simulado», «Solo visual»).
- [x] Retorno explícito en `/settings/calibration`.
- [x] Grupo colapsable con `grid-template-rows` (texto que envuelve).
- [x] Campana del planificador → `/alerts`.
- Deuda documentada: el remanente de `map`/`monitoring` es estado/ciclo de vida del mapa.

## Fase 7 — Verificación y cierre

- [x] `e2e/a11y-planner.spec.ts` — axe (`wcag2a/aa`, `wcag21a/aa`) en rutas primarias.
- [x] `e2e/sidebar-permissions.spec.ts` — navegación por rol (planificador/conductor/residente).
- [x] Docs actualizadas: `estado-modulos.md`, `manual-usuario.md`, `contratos-ui.md`.
- [x] Este checklist de cierre.

## Cómo verificar (cuando se autoricen tests)

```bash
npm run test                                   # unit (incluye paridad i18n)
npx playwright test e2e/a11y-planner.spec.ts   # auditoría axe
npx playwright test e2e/sidebar-permissions.spec.ts
npx playwright test e2e/operational-map.spec.ts e2e/daily-planning.spec.ts  # regresión mapa/monitoreo
```

> **Nota:** en este ciclo **no se ejecutaron tests ni e2e** (regla del proyecto). La suite quedó
> *añadida y sin correr*; la aceptación «sin violaciones axe bloqueantes» debe confirmarse con la
> primera corrida de `e2e/a11y-planner.spec.ts`.

## Pendientes fuera de alcance (backlog)

- Migración i18n del copy de las features.
- Polaridad de KPIs (`lowerIsBetter`) para tendencias.
- Extracción del estado/ciclo de vida del mapa (`syncOverlayLayers`) para bajar de ~700 líneas.
- `inert` del fondo en Modal/Drawer.
- Deuda base de `tsc` (`Table.tsx`, `pageChromeSlots.tsx`, `core/api/*`, `Badge title`).
