# Paleta modo oscuro integrado — Fase 0

Referencia visual y semántica para el rediseño del sidebar y la app en dark mode.  
Implementación de tokens: `src/design-system/tokens.css` (variables `--fero-*` + utilidades Tailwind).

## Enfoque

- **Light:** sidebar azul marca (`#232AB6`); contenido claro.
- **Dark (integrado):** sidebar navy (`#0b1220`) alineado con fondo app (`#0f172a`); acentos **verde FERO** en nav activo y logo.

## Tokens semánticos

| Token CSS / Tailwind | Light | Dark | Uso |
|----------------------|-------|------|-----|
| `--fero-bg-app` / `bg-bg-app` | `#f8fafc` | `#0f172a` | Fondo general, `body` |
| `--fero-bg-elevated` / `bg-bg-elevated` | `#ffffff` | `#1e293b` | Cards, paneles, modales |
| `--fero-bg-sidebar` / `bg-bg-sidebar` | `#232AB6` | `#0b1220` | Sidebar |
| `--fero-bg-sidebar-elevated` | `rgba(255,255,255,0.1)` | `#111827` | Widget operadores, bloques footer |
| `--fero-border-default` / `border-border-default` | `#e2e8f0` | `#334155` | Bordes app y sidebar |
| `--fero-sidebar-border` | `transparent` | `#334155` | Borde derecho sidebar (dark) |
| `--fero-text-primary` | `#0f172a` | `#f1f5f9` | Títulos |
| `--fero-text-muted` | `#94a3b8` | `#94a3b8` | Texto secundario global |

### Navegación (sidebar)

| Token | Light (sobre azul) | Dark (sobre navy) | Uso |
|-------|--------------------|-------------------|-----|
| `--fero-nav-text` | `rgba(255,255,255,0.65)` | `#cbd5e1` | Label ítem |
| `--fero-nav-text-muted` | `rgba(255,255,255,0.4)` | `#64748b` | Descripción bajo label |
| `--fero-nav-section` | `rgba(255,255,255,0.35)` | `#475569` | Encabezados «Operación», «Análisis» |
| `--fero-nav-active-bg` | `#34D634` | `#34D634` | Pill ítem activo |
| `--fero-nav-active-text` | `#ffffff` | `#0b1220` | Texto ítem activo (dark: contraste sobre verde) |
| `--fero-nav-hover-bg` | `rgba(255,255,255,0.1)` | `#1e293b` | Hover fila nav |

### Marca en sidebar (dark)

| Elemento | Color |
|----------|-------|
| «FERO» | `#ffffff` |
| «MAP» | `#93F555` (`--color-fero-green`) |
| «En línea» / métricas positivas | `#93F555` o `#34D634` |

## Muestras de color

### Superficies — Light

```
bg-app       ████████  #f8fafc
bg-elevated  ████████  #ffffff
bg-sidebar   ████████  #232AB6
border       ████████  #e2e8f0
```

### Superficies — Dark

```
bg-app       ████████  #0f172a
bg-elevated  ████████  #1e293b
bg-sidebar   ████████  #0b1220
sidebar+     ████████  #111827  (elevated)
border       ████████  #334155
```

### Acento FERO (ambos modos)

```
fero-green       ████████  #93F555
fero-green-mid   ████████  #56E93D
fero-green-dark  ████████  #34D634  ← nav activo
```

## Utilidades Tailwind (Fase 1)

| Clase | Token CSS | Notas |
|-------|-----------|-------|
| `bg-app` | `--color-app` | Shell, main |
| `bg-elevated` | `--color-elevated` | Header, cards |
| `bg-sidebar` | `--color-bg-sidebar` | Sidebar (cambia con tema) |
| `bg-sidebar-elevated` | `--color-sidebar-elevated` | Widget operadores |
| `border-default` | `--color-default` | Bordes app |
| `border-sidebar` | `--color-border-sidebar` | Borde derecho sidebar (dark) |
| `border-sidebar-divider` | `--color-sidebar-divider` | Separadores internos sidebar |
| `text-nav` | `--color-nav` | Labels nav |
| `text-nav-muted` | `--color-nav-muted` | Descripciones nav |

## Aliases legacy (compatibilidad)

Hasta migrar componentes en Fase 1+:

| Legacy | Mapea a |
|--------|---------|
| `bg-surface` | `--fero-bg-elevated` |
| `border-border` | `--fero-border-default` |
| `text-text-primary` | `--fero-text-primary` |
| `bg-sidebar` | `--fero-bg-sidebar` |
| `dark:bg-dark-surface` | `--fero-bg-app` (alias dinámico) |
| `dark:bg-dark-surface-hover` | `--fero-bg-elevated` (alias dinámico) |
| `dark:border-dark-border` | `--fero-border-default` (alias dinámico) |

## Próximas fases

1. ~~**Fase 2:** `Sidebar.tsx` — tokens de nav integrados~~ ✓
2. ~~**Fase 3:** Shell — header/main unificados, overlay mobile~~ ✓
3. ~~**Fase 4:** componentes y mapas (planner flow)~~ ✓
4. ~~**Fase 5:** persistencia del tema (localStorage + perfil)~~ ✓
5. ~~**Fase 6:** QA — contraste AA, foco teclado, E2E sidebar~~ ✓

## QA Fase 6

| Verificación | Criterio |
|--------------|----------|
| Nav activo dark | `#0b1220` sobre `#34D634` ≥ 4.5:1 (AA) |
| Foco teclado | `focus-visible:ring-fero-green` en links del sidebar |
| Nav por rol | Planificador completo; operador/residente reducida en dark |
| E2E | `e2e/dark-mode-sidebar.spec.ts` + capturas en `docs/fase-6/capturas/` |

## Verificación manual

1. Abrir DevTools → `:root` y `html.dark` → comprobar que `--fero-bg-sidebar` cambia de `#232AB6` a `#0b1220`.
2. Toggle modo oscuro (sidebar aún puede verse azul hasta Fase 2; el **body** debe usar `#0f172a` vía `--fero-bg-app`).
3. Utilidades disponibles: `bg-bg-app`, `bg-bg-elevated`, `bg-bg-sidebar`, `text-nav-text`, `bg-nav-active-bg`, etc.
