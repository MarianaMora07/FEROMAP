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
| **Primarios** | Dashboard · Plan semanal · Plan del día · Monitoreo en vivo · Mapa GIS · Configuración |
| ▸ Consulta y reportes | Historial unificado · Reportes · Analítica |
| ▸ Catálogos | Vehículos · Conductores · Puntos de Recolección |
| ▸ Tesis y demostración | Simulación ACO · Casos de estudio · Demostración ACO |

> El administrador ve etiquetas **demo / producto** junto a cada módulo para distinguir evidencia de tesis del producto operativo.
>
> La **campana** del encabezado abre las **Alertas** (`/alerts`); ese módulo no está en el menú lateral a propósito (se consume desde el Dashboard y el Monitoreo). **Configuración** agrupa *Algoritmo* y *Calibración*; la calibración tiene un enlace de vuelta a Configuración.
>
> Los grupos colapsables (**Consulta y reportes**, **Catálogos**, **Tesis y demostración**) se abren solos cuando contienen la ruta activa y son operables por teclado.

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

## 9. Criticidad, frecuencia y riesgo de rebose

FEROMAP trata la criticidad como un **estado temporal**, no como un atributo fijo:

- **Contenedores críticos** (Dashboard): contenedores que **ahora** están al ≥ 80 % de llenado. La tarjeta indica "Crítico ahora" y enlaza a la lista ya filtrada por estado crítico.
- **Se llenarán antes de la próxima visita** (Dashboard): contenedores que **aún no están críticos** pero cruzarán el umbral **antes de su próxima recolección**. El pie nombra al más urgente con sus dos cifras y el **origen de la fecha**: *"CNT-131: cruza el umbral en 5.4 h · recolección en 105.8 h (plan 21/09)"*.
- Ambas tarjetas son **complementarias** (no se solapan): críticos ahora **+** los que se llenarán antes de la visita = total de contenedores con riesgo de rebose.
- **De dónde sale "la próxima visita"**: primero el **plan semanal aprobado** (lo que realmente se va a recoger → etiqueta `(plan dd/mm)`); si el contenedor no está en ningún día planificado del horizonte, se usa su **agenda declarada** (*Agenda de visitas* → etiqueta `(agenda dd/mm)`). La línea de cobertura desglosa ambos orígenes (*"100 evaluables · 40 según plan · 60 según agenda"*). Un contenedor sin plan ni agenda no se proyecta: se informa aparte (*"Y sin recolección programada"*) en vez de inventar la visita. La misma fuente alimenta las **alertas de tipo agenda** y el sesgo ACO.
- La **hora de recolección** (07:00) y los días de agenda se interpretan en la **zona operativa** configurada en **Administración → General → Zona horaria** (por defecto `America/Caracas`), no en UTC. Es la única fuente de zona horaria del sistema.
- **Zonas que requieren más atención** (Dashboard): *top* de zonas ordenado por contenedores críticos, contenedores en rebose y llenado medio. Cada fila enlaza a los puntos de esa zona.
- El umbral crítico es configurable en **Administración → General → Umbral de llenado (%)** (por defecto 80).

**Velocidad de llenado y generación de residuos**

- Por **zona**: en *Puntos de Recolección* está el panel **"Generación por zona"**. Cada fila muestra los contenedores, la capacidad total, la generación efectiva y los contenedores en rebose, y permite fijar:
  - **Tasa zona (kg/día)**: generación total manual de la zona.
  - **Per cápita (kg/hab/día)**: si se define, la tasa total se **deriva** como `población × per cápita` (la población viene del catálogo de sectores). Tiene prioridad sobre la tasa manual.
  - **Reparto**: `Igual` (tasa ÷ contenedores), `Por capacidad` (proporcional al tamaño) o `Por población` (proporcional a la población servida de cada contenedor). Si faltan datos, cae a capacidad y luego a iguales.
  - **Factor llenado** (> 1 = la zona se llena más rápido; útil en barrios densos).
  - **Calibrar con pesos reales**: estima la tasa de cada contenedor a partir de los pesos recolectados (ver abajo).
- Por **contenedor**: al crear/editar un punto:
  - **Capacidad máxima (kg)**: cuánto admite el contenedor.
  - **Tasa de generación (kg/día)**: tasa absoluta del contenedor; tiene prioridad sobre capacidad/horas. Se bloquea si la zona gestiona la tasa.
  - **Horas base de llenado**: tiempo hasta llenarse sin factor (por defecto 72 h).
  - **Población servida**: habitantes que sirve el contenedor; alimenta el reparto por población de la zona.
  - **Factor de llenado (opcional)**: reemplaza al de la zona; vacío = hereda.

> Precedencia de la tasa efectiva: tasa del contenedor (kg/día) > reparto de la zona (tasa ÷ peso del contenedor) > capacidad ÷ horas base ajustadas por el factor. Una tasa por contenedor y una tasa de zona no coexisten: si la zona tiene tasa, el valor por contenedor lo gestiona la zona.

**Calibración con pesos reales**

- Al avanzar paradas, FEROMAP guarda el **peso recolectado** de cada contenedor. El botón *Calibrar con pesos reales* estima la tasa efectiva de cada contenedor (EWMA de `peso ÷ horas` entre recolecciones consecutivas) y la escribe como tasa propia. Los contenedores de zonas con tasa gestionada se omiten.

**Rebose**

- Además de la criticidad (80 %), FEROMAP mide el **rebose** (llenado por encima de la capacidad). Se muestra por contenedor (`overflowKg`, `overflowPct`) y se cuenta por zona. El motor puede **penalizar el rebose** en su función objetivo, configurable desde **Configuración → Algoritmo** (por defecto desactivado, `0`).

**Parámetros del algoritmo (planificador)**

- En **Configuración → Algoritmo** (`/settings`) el planificador ajusta **todos** los parámetros del motor: **alpha** (feromona), **beta** (distancia), **rho** (evaporación), **Q** (depósito de feromona) y **refuerzo elitista**, **hormigas**, **iteraciones**, **paciencia**, **pasadas de 2-opt**, los **pesos heurísticos** (riesgo, crítico, lleno) y los **factores de matriz** por llenado, más la **penalización por rebose** (m/kg), los parámetros de **calibración** (alpha y ventana) y el bloque **Uso de flota**: **equidad de carga** (λ_b), **makespan** (λ_t), **mínimo de camiones activos por día**, **jornada de turno por defecto** (recorta el turno de todas las optimizaciones, incluido el plan semanal) y **rotación de flota semanal**. La misma pantalla muestra la **ecuación del ACO** en la parte superior y los **valores actuales** debajo, para ver de un vistazo qué combinación se está aplicando. Se guardan con auditoría y actúan como valores por defecto de la corrida (la corrida puede sobreescribir hormigas/iteraciones).

**Frecuencia híbrida**

- En el detalle de un punto, "Frecuencia semanal" declara las visitas por semana. El sistema las compara con las que **exige la física** (`requiredVisitsPerWeek`); si son insuficientes muestra el aviso *"la frecuencia declarada podría ser insuficiente"* (sobrecarga).

**Alertas**

- Categoría **Agenda** ("Rebosará antes de la próxima visita"): puntos no críticos que no alcanzarán a vaciarse a tiempo.

## 10. Catálogos

**Vehículos**, **Conductores** y **Puntos de Recolección** (grupo Catálogos) se gestionan poco:

- Vehículos: estado/disponibilidad y edición (sin alta/baja masiva). En el detalle de cada vehículo, la pestaña **Territorio** fija los **sectores preferentes** de ese camión (vía su conductor): el motor los respeta cuando el día tiene territorio completo; si no, el ACO reparte libre.
- Conductores: crear/editar y asignar credencial.
- Puntos de Recolección: CRUD completo, ubicación en mapa, **frecuencias semanales** por punto (alimentan el Autocompletar del Plan semanal), **tasa de generación por zona/contenedor** (igual, por capacidad o por población; manual o per cápita), **rebose** y **calibración con pesos reales** (ver §9).

**Alertas** se atienden desde los paneles del Dashboard/Monitoreo (no tiene ítem propio en este menú).

## 11. Reportes y administración

- **Reportes**: período → Generar/Descargar (CSV/PDF) → Guardados.
- **Administración** (solo admin): General · Usuarios y Roles · Auditoría (sin pestañas placeholder).
- La **Analítica** con datos ilustrativos ya no está en el menú; usa Reportes o el Dashboard para KPIs.

## 12. Conductor y residente

| Rol | Home | Menú |
|-----|------|------|
| Conductor | `/operator` — Mi operación (ruta del día, averías) | Mi operación · Mapa GIS · Alertas |
| Residente | `/resident` — Mi Recolección (horario, camión, sector) | Mi zona · Mapa mi sector · Puntos · Alertas |

## 13. Solución de problemas

| Problema | Acción |
|----------|--------|
| No puedo ejecutar simulación | Verifique vehículos asignables y puntos activos (panel lateral). |
| Plan del día bloqueado | Falta aprobar el Plan semanal (bandera directiva). |
| Error al cargar | `just health` y `just defense-verify` en el servidor. |
| Pantalla en blanco tras login | Compruebe el stack (`just up`). |

## 14. Modo oscuro

- Alternar claro/oscuro: menú del usuario (esquina superior).
- Elegir Sistema/Claro/Oscuro: **Perfil → Preferencias del sistema → Tema → Guardar** (persiste tras F5).

## 15. Documentación relacionada

- [Modelo de criticidad (ADR-002)](../fase-0/adr-criticidad.md)
- [Arquitectura de navegación (fuente de verdad IA)](../ux/arquitectura-navegacion.md)
- [Estado de módulos (matriz de trazabilidad)](../estado-modulos.md)
- [Guión demo defensa](./guion-demo-defensa.md)
- [Checklist aceptación](../fase-0/checklist-aceptacion-defensa.md)
