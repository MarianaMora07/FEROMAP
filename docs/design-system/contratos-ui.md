# Contratos de UI — design-system (Fase 0)

| Campo | Valor |
|-------|-------|
| **Estado** | Vigente — reglas fijadas en Fase 0 |
| **Fecha** | 2026-09-24 |
| **Alcance** | Patrón único de tabs ARIA · contrato de foco (Modal/Drawer/overlays) · unidad de radio de controles · política de verificación a11y |
| **Código de referencia** | `src/design-system/components/*` · `src/design-system/layout/*` · `src/design-system/tokens.css` |
| **Complementa** | [Paleta modo oscuro](./dark-mode-palette.md) · [Arquitectura de navegación](../ux/arquitectura-navegacion.md) |

## Propósito

Fijar **una sola vez** las reglas transversales de UI que las fases posteriores
(2–6) implementan, para no corregir dos veces ni divergir por módulo. Este
documento es la fuente de verdad de: cómo se construyen las pestañas, cómo se
gestiona el foco en superficies superpuestas, qué radio usa cada familia de
componente, y cómo se verifica la accesibilidad.

Regla general: **si el problema es transversal, se resuelve en el design-system,
no con un parche por módulo.**

---

## 1. Patrón único de tabs ARIA

### Cuándo NO usar tabs

Si cada "pestaña" **navega a una ruta distinta**, no son tabs: son enlaces.
Usar `<A>` con `aria-current="page"` (patrón ya vigente en
`src/features/settings/SettingsTabs.tsx`). Reservar `role="tab"` para paneles
que se intercambian dentro de la misma pantalla.

### Anatomía obligatoria

| Elemento | Rol / atributos |
|----------|-----------------|
| Contenedor | `role="tablist"` + `aria-label` o `aria-labelledby` |
| Pestaña activa | `role="tab"`, `id` estable, `aria-selected="true"`, `aria-controls="<panelId>"`, `tabindex="0"` |
| Pestaña inactiva | `role="tab"`, `aria-selected="false"`, `aria-controls="<panelId>"`, `tabindex="-1"` (roving tabindex) |
| Panel | `role="tabpanel"`, `id="<panelId>"`, `aria-labelledby="<tabId>"`, `tabindex="0"` si no contiene un elemento enfocable |

### Contrato de teclado

- `←` / `→` (horizontal) o `↑` / `↓` (vertical): mueven la selección al tab anterior/siguiente.
- `Home` / `End`: primer / último tab.
- Activación **automática**: al enfocar un tab, su panel se muestra.
- El foco permanece dentro del `tablist` al navegar con flechas (roving tabindex).

### Objetivo de implementación

Extraer `src/design-system/components/Tabs.tsx` en Fase 2 y migrar los consumidores.

**Implementación (Fase 3):** `src/design-system/components/Tabs.tsx`
(`TabList` + helpers `tabButtonId`/`tabPanelId`) aplica el patrón (roving tabindex,
flechas/Home/End) y admite `panelId` para paneles únicos cuyo contenido cambia con
la pestaña activa. Adoptado en `src/features/optimization/index.tsx` y
`src/features/monitoring/index.tsx`.
**Pendiente:** `CalibrationPage` sigue usando `aria-current="page"` sobre botones
(candidato a migrar a `TabList`).

---

## 2. Contrato de foco — Modal, Drawer y overlays

Toda superficie superpuesta (Modal, Drawer, popovers, paneles flotantes del mapa)
debe cumplir:

| Momento | Requisito |
|---------|-----------|
| Al abrir | Mover el foco al primer elemento enfocable o a `[data-modal-autofocus]` |
| Al abrir | Recordar el elemento que disparó la apertura (trigger) |
| Abierto | **Focus trap**: `Tab`/`Shift+Tab` ciclan dentro del overlay; el foco no escapa al documento |
| Abierto | El contenido de fondo queda `inert` (o `aria-hidden`) mientras el overlay esté abierto |
| Cerrar (Escape, botón, clic en backdrop) | Devolver el foco al trigger |
| Escape | El listener se registra **solo mientras** el overlay está abierto |
| No modal (p. ej. panel "Capas" del mapa) | Cerrar con clic-fuera **y** `Escape`; resolver solapes de z-index |

**Implementación (Fase 2):** `src/design-system/components/focusTrap.ts`
(`useFocusTrap`) aplica el contrato a `Modal` y `Drawer` (foco inicial, trap de
`Tab`/`Shift+Tab`, `Escape` solo con el overlay abierto y restauración al trigger);
el **sidebar cerrado** usa `inert` (`Sidebar.tsx`). **Implementación (Fase 3):** los overlays del mapa (`map/index.tsx`) cierran con
`Escape` y clic-fuera, y exponen `aria-expanded`/`aria-controls`/`aria-label`.
**Pendiente:** el fondo de un overlay (Modal/Drawer) todavía no se marca `inert`.

---

## 3. Unidad de radio de controles

Tokens disponibles (`src/design-system/tokens.css`, bloque `@theme inline`):
`--radius-sm: 8px` · `--radius-md: 12px` · `--radius-lg: 16px` ·
`--radius-xl: 20px` · `--radius-full: 9999px`.

### Asignación por familia

| Familia | Componentes | Radio |
|---------|-------------|-------|
| **Control** (interactivo) | `Button`, `TextField`, `SelectField`, chips/segmentos | `--radius-md` (12px) |
| **Superficie contenedora** | `Card`, `Table`, `Toast` | `--radius-lg` (16px) |
| **Overlay** | `Modal`, `Drawer`, popovers | `--radius-xl` (20px) |
| **Pill** | `Badge`, avatar, ítem activo de nav | `--radius-full` |
| **Drawer anclado a borde** | `Drawer` lateral | sin radio (pegado al borde) |

### Reglas

1. Usar utilidades derivadas de los tokens (`rounded-md`, `rounded-lg`,
   `rounded-xl`) o `rounded-[var(--radius-*)]`. **Nunca** valores literales en px.
2. Un control (botón o input) debe compartir el mismo radio entre sí.

**Resuelto (Fase 2):** `Button` ahora usa `--radius-md` (12px), alineado con
`TextField`/`SelectField`. Superficies (`Card`, `Table`, `Toast`) siguen en
`--radius-lg`; overlays (`Modal`, `Drawer`) en `--radius-xl`.

---

## 4. Política de verificación de accesibilidad

| Nivel | Herramienta | Alcance | Estado |
|-------|-------------|---------|--------|
| Unit | `vitest` + `src/core/theme/contrastUtils.ts` | Contraste WCAG en tokens (`sidebarA11y.test.ts`, `themeTokens.test.ts`) | Vigente |
| E2E | `playwright` (`@playwright/test`) | Aserciones de rol/`aria-*` (p. ej. `e2e/daily-planning.spec.ts`, `e2e/operator-flow.spec.ts`) | Vigente |
| Axe | `@axe-core/playwright` | `e2e/a11y-planner.spec.ts` — smoke por ruta primaria del planificador | **Vigente (Fase 7)** |

Decisiones:

- **Axe instalado** (`@axe-core/playwright`). `e2e/a11y-planner.spec.ts` recorre las rutas primarias
  (Dashboard `/`, Plan semanal `/planning/weekly`, Plan del día `/optimization`, Monitoreo
  `/monitoring`, Mapa `/map`, Configuración `/settings`, Reportes, Analítica e Historial) con
  `wcag2a/aa` + `wcag21a/aa`. Las capas de maplibre (terceros) y el `canvas` se excluyen del barrido.
- **Criterio de aceptación:** 0 violaciones `critical`/`serious` en rutas
  primarias; las `moderate`/`minor` se registran en el backlog.
- Extender los tests de contraste a `text-muted`, badges y estados
  `warning`/`danger`.
- **No se ejecutan tests en Fase 0** (regla del proyecto: solo a pedido). Fase 0
  define la política; la ejecución corresponde a las fases 2–7.

---

## 5. Decisiones registradas (Fase 0)

### D-0.1 — Locale `pt` retirado

- **Contexto:** el selector de idioma de Perfil y de Administración ofrecía
  "Português" (`src/data/mock/profile.ts`, `src/data/mock/admin.ts`), pero no
  existía diccionario `pt` (`DICTIONARIES = { es, en }`). Elegir pt caía en
  silencio a español.
- **Decisión:** **retirar `pt`** en lugar de crear el diccionario. La cobertura
  real es ES/EN (ver `docs/estado-modulos.md`, F8) y no hay traductor en el
  alcance del proyecto.
- **Implementación:** `src/core/i18n/index.ts` (`Locale`, `SUPPORTED_LOCALES`),
  `src/core/i18n/i18n.test.ts` (test de regresión: preferencia `pt` guardada →
  ES), `src/data/mock/profile.ts`, `src/data/mock/admin.ts`.
- **Reversible:** para reintroducir pt basta crear su diccionario y volver a
  añadirlo a `SUPPORTED_LOCALES` y a las listas de opciones.

### D-0.2 — Tabs, foco y radios

Los patrones de §1, §2 y §3 quedan fijados aquí y se implementan en las fases 2–3.

### D-2.1 — Radios de control unificados

`Button` pasa a `--radius-md` (12px) según el contrato §3; superficies y overlays
sin cambios. Los tokens siguen siendo la única fuente de radios (sin px literales).

### D-2.2 — Tokens legacy `@deprecated` (se conservan)

Se **conservan** los alias `--color-dark-*` y las utilidades `bg-surface`,
`border-border`, `text-text-*` para no romper consumidores existentes; quedan
marcados `@deprecated` y se migran de forma incremental, sin uso en código nuevo.
Anotado en `src/design-system/tokens.css`.

### D-2.3 — Movimiento reducido

`tokens.css` neutraliza animaciones y transiciones bajo
`@media (prefers-reduced-motion: reduce)`, sin ocultar contenido ni estados.

---

## 6. Estados, feedback y encabezados (Fase 4)

### 6.1 Patrón único de estados

| Estado | Componente | Contrato |
|--------|------------|----------|
| Carga | `LoadingPanel` | `role="status"`/`aria-live` |
| Vacío | `PlanningEmptyState` (o texto `role="status"`) | Mensaje explícito, nunca pantalla en blanco |
| Error | `ErrorState` | `role="alert"` + botón **Reintentar** opcional (`onRetry`) |

Toda vista con datos debe cubrir carga, vacío y error. El reintento vuelve a
disparar la carga (función `reload()` reutilizable o una señal `reloadKey`).
Adoptado en `reports`, `analytics` y `planning/history`.

### 6.2 Feedback de acciones

- Éxito/error de una acción → **toast global** (`globalToast.addToast(msg, variant)`),
  no banners locales. Migrado en `settings` (`AlgorithmSettingsPanel`) y calibración.
- Acciones de alto impacto → **`ConfirmDialog`** antes de ejecutar (p. ej. «Aplicar»
  perfil de calibración, «Cerrar día», «Archivar semana»).

### 6.3 Encabezados y puntos de referencia

- **Un solo `h1` por página**: lo aporta el topbar (`Header`) como
  `<h1 id="page-title">` cuando la ruta tiene `pageMeta`.
- Las rutas sin título en el topbar (p. ej. `/drivers`, `/planning/weekly`,
  `/case-studies/:id`, vistas de conductor) ponen `id="page-title"` en su propio `h1`.
- Las secciones internas usan `h2`+ (sin `h1` duplicado).
- El contenido principal se etiqueta con `<main aria-labelledby="page-title">`.

Checklist: al añadir una página primaria, darle `pageMeta` en `Header.tsx` o un
`h1#page-title` propio, y usar `h2` para sus secciones.

---

## 7. i18n (Fase 5)

- **Fuente de verdad**: `es` en `src/core/i18n/dictionaries.ts`; el tipo
  `en: Record<MessageKey, string>` obliga a la paridad de claves, que además verifica
  `src/core/i18n/i18n.test.ts`.
- **Cobertura**: navegación y shell (`nav.*`, `sections.*`, `shell.*`) y componentes del
  design-system (`ui.*`, `status.*`). El copy de las features migra de forma incremental.
- En el design-system **ningún texto ni `aria-label` va hardcodeado**: usar `useLocale()`
  (reactivo) con una clave; el español permanece como `fallback` en datos externos
  (p. ej. `StatusBadge` con estados no catalogados).
- `<html lang>` y `<html dir>` se sincronizan con el locale activo en `setLocale`
  (`LOCALE_DIR`); ES/EN son LTR y el mapa queda listo para RTL.
- `pt` está retirado (D-0.1).

## Checklist de aplicación (por PR de UI)

- [ ] ¿Son tabs o enlaces de ruta? Si navegan, usar `<A>` + `aria-current`.
- [ ] Tabs: `tablist`/`tab`/`tabpanel` con `aria-controls`, roving tabindex y flechas.
- [ ] Overlays: foco inicial, trap, `inert` en el fondo, cierre con Escape y restauración de foco.
- [ ] Radios: control = `--radius-md`; superficie = `--radius-lg`; overlay = `--radius-xl`; sin px literales.
- [ ] Estados: `loading`/`empty`/`error` explícitos y `role="alert"`/`aria-live` donde aplique.
- [ ] Textos y `aria-label` traducibles (no hardcodeados) en controles del design-system.

## Referencias

- [Paleta modo oscuro](./dark-mode-palette.md)
- [Arquitectura de navegación](../ux/arquitectura-navegacion.md)
- [Reglas de navegación](../fase-5/reglas-navegacion.md)
- [Estado de módulos](../estado-modulos.md)
