# Manual de usuario — FEROMAP

**Versión:** 2.0 (alineado con `docs/ux/arquitectura-navegacion.md`)  
**Rol principal:** Planificador / Administrador  
**Sistema:** Sistema Basado en IA para Optimización Dinámica de Rutas de Recolección — Parroquia Unare

---

## 1. Acceso al sistema

1. Abra la URL del entorno (desarrollo: http://localhost:5173).
2. Inicie sesión en `/login`.

| Email | Contraseña | Rol |
|-------|------------|-----|
| `plan@fero.com` | `123456789` | Planificador |
| `admin@fero.com` | `123456789` | Administrador |
| `conductor@fero.com` | `123456789` | Conductor |
| `residente@fero.com` | `123456789` | Residente |

---

## 2. Navegación (planificador / administrador)

El menú lateral se organiza por frecuencia de uso:

| Nivel | Ítems |
|-------|-------|
| **Primarios** | Dashboard · Plan semanal · Plan del día · Monitoreo en vivo · Mapa GIS |
| ▸ Consulta y reportes | Historial unificado · Reportes |
| ▸ Catálogos | Vehículos · Conductores · Puntos de Recolección |
| ▸ Tesis y demostración | Simulación ACO · Casos de estudio · Demostración ACO |

> El administrador ve etiquetas **demo / producto** junto a cada módulo para distinguir evidencia de tesis del producto operativo.

**¿Qué módulo usar?**

| Necesito… | Vaya a… |
|-----------|---------|
| Ver qué sigue hoy y el estado de la semana/día | **Dashboard** (`/`) |
| Aprobar qué puntos visitar cada día de la semana | **Plan semanal** (`/planning/weekly`) |
| Generar, simular y despachar las rutas del día | **Plan del día** (`/optimization`) |
| Gestionar visitas pendientes (carry-over) | **Plan del día → pestaña Pendientes** |
| Ver la flota en el mapa / atender incidencias | **Monitoreo en vivo** (pestañas Mapa en vivo / Incidencias y alertas) |
| Buscar una semana, un día o una incidencia | **Historial unificado** (`/planning/history`) |
| Exportar reportes | **Reportes** (`/reports`) |
| Evaluar el algoritmo (tesis) | **Simulación ACO** (grupo Tesis y demostración) |
| Consultar mapa de contenedores/rutas | **Mapa GIS** (`/map`) |

---

## 3. Dashboard (hub del día)

El Dashboard **absorbió el antiguo "Hub de planificación"**: al entrar como planificador ve:

- Encabezado con accesos **Plan semanal** y **Monitoreo**.
- **Mi planificación**: tarjeta "Qué hacer ahora" (siguiente acción sugerida), stepper **Recorrido operativo del día**, atajos (Semana/Hoy/Pendientes/Historial/Monitoreo) y tarjetas de **Semana actual · Hoy · Pendientes · Incidencias**.
- Niveles directivo/administrativo/operativo con accesos directos.
- **Situación operativa** (alertas activas y rutas en curso).

## 4. Plan semanal — configuración base (nivel directivo)

1. Menú primario → **Plan semanal** (`/planning/weekly`).
2. En **Configurar días**: elija las **zonas** que se cubrirán cada día (una zona añade todos sus puntos y puede repetirse en varios días) y defina la **flota de la semana por tipo** (o use **Todos (por defecto)**). Guarde el borrador.
3. **Validar** (motor real por día) y luego **Aprobar**. Hasta aprobar, el Plan del día está bloqueado.
4. Tras aprobar, en el paso final: **Generar plan operativo de la semana** — el sistema optimiza Lun→Vie **en secuencia** (barra de progreso) y muestra la tabla **Camión × Día** (km, duración y puntos por camión).
5. Desde esa tabla puede **Abrir día** (ir a `/optimization` de esa fecha) y **Notificar** a los conductores **por día o toda la semana** (la acción pide confirmación; es irreversible por día).
6. Consulte **Versiones** y **Exportar PDF** en la etapa de configuración.

## 5. Plan del día (uso diario)

1. Menú primario → **Plan del día** (`/optimization`).
2. Pestaña **Optimizar y despachar**:
   1. Seleccione la **fecha de operación** (calendario superior).
   2. Pulse **Generar Plan Operativo** (optimización ACO real, sin envío a campo); si el día ya tiene corrida el botón dice **Regenerar Plan Operativo**.
   3. Revise los resultados: **Resumen**, **Comparación (Baseline vs ACO)**, **Desglose**, **Convergencia** y **Rutas por vehículo**.
   4. Cuando esté conforme, **Notificar a conductores** (aparece solo después de generar) — asigna las rutas y avisa a los conductores. Después el botón pasa a **Monitoreo**.
   5. Para ver el recorrido animado use el enlace/playback del mapa (`?playback=1`).
   6. Al finalizar la jornada, use **Cerrar día** desde el menú **⋯** (arriba a la derecha).
3. Pestaña **Pendientes**: gestiona visitas no cubiertas (carry-over) que pasan al siguiente día. Puede **Cancelar antiguos (>30 días, sin fecha)**, marcar un pendiente como **Ya visitado**, o **Cancelar** uno puntual. Los que deja abiertos se incorporan solos al regenerar.

## 6. Monitoreo en vivo

- Pestaña **Mapa en vivo**: flota sobre el mapa, lista de vehículos con progreso, controles de reproducción y avance.
- Pestaña **Incidencias y alertas**: reportar avería, recálculo de contenedores críticos, actividades y alertas, e incidencias recientes.
- El rol **conductor** opera desde **Mi operación** (`/operator`), no desde Monitoreo.

## 7. Historial unificado

`/planning/history` — un solo buscador por **semana**, **día** o **incidencia**, con deep links a cada plan del día o corrida ACO vinculada.

## 8. Simulación ACO (tesis)

Grupo **Tesis y demostración → Simulación ACO** (`/simulation`):

- Pestaña **Baseline vs ACO**: configura escenario (condiciones, parámetros αβρ, dotación) → ejecuta → KPIs comparativos y exportaciones.
- Pestaña **Historial**: corridas anteriores con `?simulationId=…` para abrir resultados directo.

> La simulación **no despacha rutas** ni sustituye la operación diaria (banner explícito). El plan semanal vive en su módulo propio (`/planning/weekly`); las URLs antiguas `?view=weekly` redirigen solas.

## 9. Catálogos

**Vehículos**, **Conductores** y **Puntos de Recolección** (grupo Catálogos) se gestionan poco:

- Vehículos: estado/disponibilidad y edición (sin alta/baja masiva). En el detalle de cada vehículo, la pestaña **Territorio** fija los **sectores preferentes** de ese camión (vía su conductor): el motor los respeta cuando el día tiene territorio completo; si no, el ACO reparte libre.
- Conductores: crear/editar y asignar credencial.
- Puntos de Recolección: CRUD completo, ubicación en mapa y **frecuencias semanales** por punto (alimentan el Autocompletar del Plan semanal).

**Alertas** se atienden desde los paneles del Dashboard/Monitoreo (no tiene ítem propio en este menú).

## 10. Reportes y administración

- **Reportes**: período → Generar/Descargar (CSV/PDF) → Guardados.
- **Administración** (solo admin): General · Usuarios y Roles · Auditoría (sin pestañas placeholder).
- La **Analítica** con datos ilustrativos ya no está en el menú; usa Reportes o el Dashboard para KPIs.

## 11. Conductor y residente

| Rol | Home | Menú |
|-----|------|------|
| Conductor | `/operator` — Mi operación (ruta del día, averías) | Mi operación · Mapa GIS · Alertas |
| Residente | `/resident` — Mi Recolección (horario, camión, sector) | Mi zona · Mapa mi sector · Puntos · Alertas |

## 12. Solución de problemas

| Problema | Acción |
|----------|--------|
| No puedo ejecutar simulación | Verifique vehículos asignables y puntos activos (panel lateral). |
| Plan del día bloqueado | Falta aprobar el Plan semanal (bandera directiva). |
| Error al cargar | `just health` y `just defense-verify` en el servidor. |
| Pantalla en blanco tras login | Compruebe el stack (`just up`). |

## 13. Modo oscuro

- Alternar claro/oscuro: menú del usuario (esquina superior).
- Elegir Sistema/Claro/Oscuro: **Perfil → Preferencias del sistema → Tema → Guardar** (persiste tras F5).

## 14. Documentación relacionada

- [Arquitectura de navegación (fuente de verdad IA)](../ux/arquitectura-navegacion.md)
- [Estado de módulos (matriz de trazabilidad)](../estado-modulos.md)
- [Guión demo defensa](./guion-demo-defensa.md)
- [Checklist aceptación](../fase-0/checklist-aceptacion-defensa.md)
