# Fase 1 — Navegación y puntos de entrada

**Estado:** completado  
**Fecha:** 2026-08-08  
**ADR de referencia:** [adr-001-simulacion-principal.md](../fase-0/adr-001-simulacion-principal.md)

## Resumen de cambios

Implementación de la jerarquía visual y puntos de entrada según Opción A: **Simulación** como flujo principal, **Planificación operativa** como módulo secundario.

---

## Antes vs después

### Menú lateral (admin / planificador)

| Antes | Después |
|-------|---------|
| Dashboard | Dashboard |
| **Optimización de Rutas** | **Simulación de escenarios** |
| Mapa GIS | Mapa GIS |
| Vehículos | Vehículos |
| Conductores | Conductores |
| Puntos de Recolección | Puntos de Recolección |
| **Simulación** (abajo) | Monitoreo en Tiempo Real |
| Monitoreo | — *sección Operación* — |
| Reportes | **Planificación operativa** *(sub: uso diario de rutas)* |
| Analítica | — *sección Resultados* — |
| Alertas | Reportes / Analítica / Alertas |

### Dashboard

| Antes | Después |
|-------|---------|
| Sin CTA destacado | Banner **“Nueva simulación”** (primario) |
| — | Botón secundario **“Planificación operativa”** |
| “Última optimización” | “Última simulación” + enlace a `/simulation` |
| “Ver todas las rutas” → `/optimization` | Sin cambio (rutas en ejecución) |

### Enlaces cruzados

| Pantalla | Antes | Después |
|----------|-------|---------|
| Vehículos | “Ir a Simulación” | **“Nueva simulación”** (+ contador asignables) |
| Puntos de recolección | “Ir a optimizar” / “Ir a Simulación” | **“Nueva simulación”** (+ contador críticos) |
| Planificación operativa | Sin orientación | Banner: *“Para comparar escenarios, usa Simulación de escenarios”* |

### Títulos de página (header)

| Ruta | Antes | Después |
|------|-------|---------|
| `/simulation` | Simulación de Escenarios | Sin cambio (ya correcto) |
| `/optimization` | Optimización de Rutas | **Planificación operativa** |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/core/auth/permissions.ts` | Reorden menú, nuevos labels, secciones `Operación` / `Resultados` |
| `src/design-system/layout/Sidebar.tsx` | Encabezados de sección y subtítulos en ítems |
| `src/features/dashboard/index.tsx` | CTA primario/secundario, última simulación |
| `src/features/vehicles/index.tsx` | Copy “Nueva simulación” |
| `src/features/collection-points/index.tsx` | Copy “Nueva simulación” |
| `src/features/optimization/index.tsx` | Banner de ayuda contextual |
| `src/data/mock/optimization.ts` | Meta de página actualizado |

---

## Criterio de cierre

- [x] Simulación aparece antes que Planificación operativa en el menú.
- [x] CTA “Nueva simulación” visible en Dashboard (1 clic desde `/`).
- [x] CTA secundario “Planificación operativa” no compite visualmente.
- [x] Enlaces desde Vehículos y Puntos apuntan a `/simulation`.
- [x] Planificación operativa orienta hacia Simulación.

**Verificación manual:** iniciar sesión como `admin@fero.com` → Dashboard → botón verde “Nueva simulación” visible sin scroll en viewport estándar.

---

## Capturas para tesis

Tomar manualmente en http://localhost:5173:

1. **Dashboard** — banner con CTAs primario y secundario.
2. **Menú lateral** — secciones Operación / Resultados y orden de ítems.
3. **Planificación operativa** — banner de ayuda hacia Simulación.
4. **Vehículos / Puntos** — botón “Nueva simulación”.

Guardar en `docs/fase-1/capturas/` (carpeta sugerida para el anexo de tesis).

---

## Próximo paso

**Fase 2** — Wizard guiado de Simulación (CTA “Ejecutar simulación”, panel de variables, validaciones).
