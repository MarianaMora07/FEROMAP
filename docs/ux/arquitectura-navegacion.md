# Arquitectura de Navegación — fuente de verdad de la IA del frontend

| Campo | Valor |
|-------|-------|
| **Estado** | Borrador — pendiente de aprobación |
| **Fecha** | 2026-09-06 |
| **Alcance** | Navegación lateral, pestañas por módulo, etiquetas y redirects del frontend |
| **Código de referencia** | `src/core/auth/permissions.ts` · `src/app/App.tsx` · `src/features/*` |
| **Complementa** | [ADR-001](../fase-0/adr-001-simulacion-principal.md) (actualiza la jerarquía de navegación) |

## Propósito

Este documento es la **fuente de verdad** de la arquitectura de información (IA) del frontend: qué módulos existen, con qué etiqueta, en qué orden, con qué pestañas, y a dónde redirige cada ruta antigua. Todo cambio de navegación posterior debe partir de aquí.

**Criterio de salida (Fase 0):** aprobación de Victor y Mariana. Sin aprobación no se implementan las fases 1–6.

## Aprobación

- [ ] Victor Astudillo — fecha: ____
- [ ] Mariana Mora — fecha: ____

---

## 1. Diagnóstico que motiva este documento

1. La nav del rol **planificador/administrador** tiene ~15 entradas y los ítems fijos (siempre visibles) son catálogos de gestión esporádica, mientras el flujo operativo diario queda en grupos colapsables.
2. `/` (Dashboard) y `/planning` (Hub de planificación) muestran el mismo contenido (`PlannerHubSection`): dos entradas al mismo destino.
3. `/optimization/levels` ("Optimización 3 niveles") reempaqueta Plan semanal + Plan del día + Simulación; no lo ejercita ningún spec e2e.
4. `/simulation` aloja componentes del Plan semanal (`WeeklyPlan*`) que pertenecen a `/planning/weekly` (migración a medias).
5. No existe en la UI una distinción entre **producto operativo**, **catálogo** y **evidencia de tesis/demo**.

## 2. Reglas de clasificación

| Categoría | Regla | Comportamiento en el menú |
|-----------|-------|----------------------------|
| **Primario** | Decisión frecuente (diaria/semanal), datos agregados/KPIs o herramienta transversal (mapa). | Fijo, siempre visible, arriba. |
| **Consulta y reportes** | Resultados ya generados que se consultan (historial, reportes). | Grupo colapsable propio. |
| **Catálogo** | Gestión esporádica: CRUD bajo demanda (se gestiona poco). | Grupo colapsable "Catálogos". |
| **Tesis / demostración** | Evidencia académica y guion de defensa; no forma parte de la operación diaria. | Grupo colapsable "Tesis y demostración" con badge **demo** visible solo para rol `administrador`. |
| **Utilidades** | Perfil, administración. | Bottom del sidebar. |
| **Personas de campo** | Conductor y residente: nav mínima de 4 ítems. | No cambia con este documento. |

El orden de los primarios sigue el ciclo **planificar → operar → supervisar**: primero se decide la semana, luego se opera el día, luego se supervisa la ejecución.

## 3. Navegación definitiva por rol

### Planificador / Administrador

| Nivel | Ítems (etiqueta · ruta) |
|-------|-------------------------|
| **Primarios** | Dashboard `/` · Plan semanal `/planning/weekly` · Plan del día `/optimization` · Monitoreo en vivo `/monitoring` · Mapa GIS `/map` |
| ▸ **Consulta y reportes** | Historial unificado `/planning/history` · Reportes `/reports` |
| ▸ **Catálogos** | Vehículos `/vehicles` · Conductores `/drivers` · Puntos de Recolección `/collection-points` |
| ▸ **Tesis y demostración** | Simulación ACO `/simulation` · Casos de estudio `/case-studies` · Demostración ACO `/demostracion` |
| **Bottom** | Administración `/admin` (solo admin) · Perfil `/profile` |

Notas:
- **Alertas** no aparece en el menú del planificador/administrador: se consume desde los paneles del Dashboard y del Monitoreo. La ruta `/alerts` se conserva (enlaces directos).
- Los ítems de Tesis y demostración llevan badge **demo** para `administrador` (no para `planificador`), para no contaminar la demo operativa.

### Conductor (sin cambios)

Dashboard `/` · Mi operación `/operator` · Mapa GIS `/map` · Alertas `/alerts`

### Residente (sin cambios)

Mi Recolección `/resident` · Mapa mi sector `/map?scope=sector` · Puntos de recolección `/collection-points` · Alertas `/alerts?scope=sector`

## 4. Pestañas definitivas por módulo

| Módulo (ruta) | Pestañas / secciones fijas |
|---------------|-----------------------------|
| **Dashboard** `/` | 1) KPIs del día · 2) "Qué hacer hoy" (stepper semana → día) · 3) Situación operativa (alertas activas + rutas en curso). *Absorbe el contenido del Hub de planificación.* |
| **Plan semanal** `/planning/weekly` | Flujo directivo: Configurar días → Validar → Aprobar. Es la **configuración base**: zonas por día (añaden sus puntos; repetibles) y flota por tipo. Tras aprobar: **Generar plan operativo de la semana** (optimiza Lun→Vie en secuencia) → tabla **Camión × Día** (km/dur/puntos) → **Notificar por día o toda la semana** → cada día se abre en el Plan del día. |
| **Plan del día** `/optimization` | 1) Optimizar (Generar/Regenerar Plan Operativo) → **Notificar a conductores** → Monitoreo · 2) Pendientes (carry-over: cancelar antiguos / marcar ya visitado). El historial vive en Historial unificado. |
| **Monitoreo en vivo** `/monitoring` | 1) Mapa en vivo · 2) Incidencias y alertas. Sin "modo campo" (eso es `/operator`). |
| **Mapa GIS** `/map` | Capas + leyenda + playback de recorrido (solo lectura). |
| **Historial unificado** `/planning/history` | Buscador único: Semana / Día / Incidencia. Único destino de historial. |
| **Reportes** `/reports` | Resumen → Generar / descargar → Guardados. |
| **Simulación ACO** `/simulation` | 1) Baseline vs ACO · 2) Historial de simulaciones. Benchmarks y sensibilidad como subvistas de resultados. Sin contenido de Plan semanal. |
| **Casos de estudio** `/case-studies` | Lista + editor (sin cambios internos). |
| **Demostración ACO** `/demostracion` | Cómo funciona · Laberinto · Convergencia (sin cambios internos). |
| **Catálogos** (`/vehicles`, `/drivers`, `/collection-points`) | Tabla + formularios (sin cambios internos). |
| **Administración** `/admin` | General · Usuarios y Roles · Auditoría. Sin pestañas "Próximamente" (las categorías Rutas/Recolección/Notificaciones/etc. sin panel real quedaron fuera; su metadata sigue en `data/mock/admin.ts` para el backlog). |
| **Perfil** `/profile` | Sin cambios internos. |
| **Conductor** (`/operator`, `/operator/plan`) | Sin cambios internos (persona de campo). |
| **Residente** (`/resident`) | Sin cambios internos (persona ciudadana). |

## 5. Etiquetas definitivas (desambiguación)

| Antes | Después | Motivo |
|-------|---------|--------|
| Hub de planificación (`/planning`) | — (fusionado en Dashboard) | Duplicaba `/`. |
| Planificación operativa (`/optimization`) | **Plan del día** | La etiqueta anterior competía con "Plan semanal" y "Simulación". |
| Optimización (3 niveles) (`/optimization/levels`) | — (eliminada del menú) | Reempaquetaba módulos existentes; andamiaje de tesis. |
| Simulación de tesis (`/simulation`) | **Simulación ACO** | "de tesis" ya lo indica el grupo "Tesis y demostración". |
| Monitoreo en Tiempo Real (`/monitoring`) | **Monitoreo en vivo** | Concisión; copy ya lo usa. |
| Analítica (`/analytics`) | — (oculta, ver §6) | KPIs con mocks declarados "fuera del guion de defensa". |

## 6. Mapa de rutas: estado actual → destino

| Ruta actual | Acción | Destino / detalle |
|-------------|--------|-------------------|
| `/` Dashboard | **Fusionar** | Absorbe el Hub de planificación (KPIs + Qué hacer hoy + Situación). |
| `/planning` Hub de planificación | **Redirigir → `/`** | Duplica el Dashboard. Redirect en `App.tsx`; actualizar e2e que visita `/planning`. |
| `/planning/weekly` | Conservar | Sin cambios de ruta. |
| `/optimization` | Conservar · renombrar | Etiqueta "Plan del día". Quitar tab "Historial operativo" (enlazar a `/planning/history`). |
| `/optimization/levels` | **Fuera del menú** | Redirect → `/planning/weekly`. Candidata a borrado en Fase 4 si no quedan referencias. |
| `/planning/history` | Conservar | Destino único de historial. |
| `/monitoring` | Conservar · depurar | Quitar "modo campo" (delega en `/operator`). |
| `/map` | Conservar | Sin cambios. |
| `/vehicles` `/drivers` `/collection-points` | Conservar · mover | Al grupo colapsable "Catálogos" (hoy son ítems fijos). |
| `/alerts` | **Fuera del menú** (planner/admin) | Acceso desde paneles Dashboard/Monitoreo; ruta conservada. Sigue en la nav de conductor y residente. |
| `/simulation` | Conservar · depurar | Al grupo "Tesis y demostración". Mover componentes `WeeklyPlan*` a `features/planning` (Fase 3). El redirect legacy `?view=weekly` → `/planning/weekly` ya está activo. |
| `/case-studies` | Conservar | Al grupo "Tesis y demostración". |
| `/demostracion` | Conservar | Al grupo "Tesis y demostración". |
| `/analytics` | **Oculto** | Sigue en `DEMO_NAV_HIDDEN_HREFS`; ruta conservada para deep links. Los KPIs reales se integran a Dashboard/Reportes cuando existan (post-grado). |
| `/reports` | Conservar | Grupo "Consulta y reportes". |
| `/admin` `/profile` | Conservar | Bottom nav. |
| `/operator` `/operator/plan` `/resident` | Conservar | Personas de campo; sin cambios. |

**Regla de oro:** ninguna ruta con enlaces existentes (docs, e2e, deep links) se elimina sin redirect previo.

## 7. Implementación (fases posteriores)

| Fase | Alcance | Archivos principales |
|------|---------|----------------------|
| 1 | Reordenar nav según §3 y §5 (sin tocar rutas). | `src/core/auth/permissions.ts` · tests de permisos · specs e2e de sidebar. |
| 2 | Fusionar Dashboard/Hub; redirect `/planning` → `/`; quitar "Historial operativo" de `/optimization` y "modo campo" de `/monitoring`. | `src/app/App.tsx` · `src/features/dashboard` · `src/features/optimization` · `src/features/monitoring` · e2e. |
| 3 | Mover `WeeklyPlan*` de `simulation` → `planning`; limpiar `/simulation`; borrar código muerto (`DashboardMiniMap.tsx`). | `src/features/simulation` · `src/features/planning/weekly`. |
| 4 | Fijar pestañas definitivas de §4 por módulo; quitar tabs "Próximamente" de `/admin`. | Módulos primarios + `/admin`. |
| 5 | Badge demo en grupo Tesis (solo admin) + doc `docs/estado-modulos.md`. | `Sidebar.tsx` · nuevo doc. |
| 6 | Actualizar `README.md`, manual de usuario, guion de defensa; suite completa. | Docs + e2e. |

## 8. No-go / restricciones

1. No se modifica la navegación de **conductor** ni **residente** (§3).
2. No se oculta ni degrada un módulo que consuma datos reales del backend sin alternativa en Dashboard/Monitoreo.
3. No se elimina una ruta referenciada por docs o e2e sin redirect.
4. `/simulation` permanece accesible y funcional: es la pieza central del guion de defensa, aunque viva en el grupo "Tesis y demostración".

## Referencias

- [ADR-001 — Simulación principal / Optimización secundaria](../fase-0/adr-001-simulacion-principal.md): este documento actualiza su jerarquía de navegación (el producto operativo creció en fases 8–11; la tesis queda aislada en su grupo).
- [Manual de usuario](../fase-6/manual-usuario.md) · [Guion de defensa](../fase-6/guion-demo-defensa.md) — se actualizarán en Fase 6.
- Código: `src/core/auth/permissions.ts`, `src/app/App.tsx`, `src/design-system/layout/Sidebar.tsx`.
