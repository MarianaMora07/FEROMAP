# Manual de usuario — FEROMAP (flujo guiado)

**Versión:** 1.0 (post Fase 6)  
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

---

## 2. ¿Qué módulo usar?

| Necesito… | Vaya a… |
|-----------|---------|
| Evaluar escenarios (lluvia, tráfico, saturación) y medir impacto del algoritmo | **Simulación de escenarios** (`/simulation`) |
| Generar y despachar rutas del día | **Planificación operativa** (`/optimization`) |
| Ver mapa con contenedores y rutas | **Mapa GIS** (`/map`) |
| Exportar datos o PDF | **Reportes** (`/reports`) |
| Tendencias y agregados | **Analítica** (`/analytics`) |

---

## 3. Flujo guiado: Simulación de escenarios

### 3.1 Entrada

- Desde el **Dashboard**, pulse **Nueva simulación**.
- O use el menú lateral: **Simulación de escenarios**.

### 3.2 Paso 1 — Configuración

1. Elija un **escenario base** (Normal, Tráfico pico, Lluvia, etc.) o use **Condiciones a simular** (toggles).
2. Ajuste parámetros si aplica:
   - **Intensidad de lluvia** (conectado al motor, solo escenario lluvia).
   - **Nivel de desechos** (conectado, solo saturación).
   - **Duración estimada** (informativo).
3. Revise el panel lateral: vehículos asignables y puntos activos.
4. Pulse **Continuar**.

### 3.3 Paso 2 — Revisión y ejecución

1. Confirme escenario derivado y recursos.
2. Pulse **Ejecutar simulación**.
3. Observe la barra de progreso y los logs del motor ACO.

### 3.4 Paso 3 — Resultados e impacto

- Resumen ejecutivo y KPIs (ruta actual vs simulada).
- Mapa con rutas optimizadas.
- Barra **¿Qué quieres hacer ahora?**:
  - Ver en mapa
  - Ver en analítica
  - Ir a reportes
  - Descargar CSV / PDF
  - Nueva simulación
  - Despachar en planificación operativa (enlace al módulo operativo)

### 3.5 Historial

- En `/simulation`, pestaña **Historial**.
- Desde una fila: ver resultados, analítica, reportes.
- URL directa: `/simulation?view=history`.

---

## 4. Planificación operativa (uso diario)

1. Menú → **Planificación operativa**.
2. Lea el banner: para evaluar escenarios, use Simulación.
3. Configure **fecha de operación** (persistida en el servidor).
4. Revise el panel **Plan del día**: puntos programados + pendientes de días anteriores.
5. Pulse **Generar ruta operativa** (optimización sin despacho automático).
6. Pulse **Despachar rutas** en un paso separado.
7. Al finalizar la jornada, use **Cerrar día** para generar pendientes del día siguiente.
8. El **Historial operativo** solo lista corridas iniciadas desde esta pantalla.

### 4.1 Plan semanal (nivel directivo)

1. Menú → **Simulación de escenarios** → pestaña **Plan semanal** (`/simulation?view=weekly`).
2. Asigne puntos por día de la semana (lun–vie).
3. **Validar con simulación** (sin despacho).
4. **Aprobar plan** para habilitar la planificación diaria.

### 4.2 Frecuencias por punto

En **Puntos de Recolección**, seleccione un punto y configure **Frecuencia semanal** (visitas/semana y días lun–dom). Estas frecuencias alimentan el botón **Autocompletar desde frecuencias** en el plan semanal.

### 4.3 Versiones y reportes

- En **Plan semanal**: **Ver versiones**, comparar cambios y **Exportar PDF**.
- En **Planificación operativa**: **Exportar PDF del día** y panel de **Gestión de pendientes** con filtros.

---

## 5. Dashboard

- **Nueva simulación** — flujo principal.
- **Planificación operativa** — operación del día.
- Tarjeta **Última simulación** — enlaces a resultados, analítica y reportes.

---

## 6. Reportes y analítica

- **Reportes:** seleccione período y exporte CSV o PDF.
- **Analítica:** filtros por fecha y sector; mapa de calor.
- Si llega desde una simulación (`?simulationId=…`), verá un banner para volver a resultados.

---

## 7. Solución de problemas

| Problema | Acción |
|----------|--------|
| No puedo ejecutar simulación | Verifique que hay vehículos asignables y puntos activos (panel lateral). |
| Error al cargar | `just health` y `just defense-verify` en el servidor. |
| Pantalla en blanco tras login | Compruebe que el stack está levantado (`just up`). |

---

## 8. Modo oscuro integrado

FEROMAP incluye un **modo oscuro integrado** alineado con la interfaz operativa (sidebar navy, contenido slate, acentos verde FERO).

| Acción | Dónde |
|--------|--------|
| Alternar claro / oscuro | Menú lateral → **Modo oscuro** / **Modo claro** |
| Elegir Sistema, Claro u Oscuro | **Perfil** → Preferencias del sistema → **Tema** → Guardar |

- **Sistema:** sigue la preferencia de su dispositivo.
- La elección se **guarda en su perfil** y se mantiene tras recargar la página (F5).
- En modo oscuro, el sidebar usa tono navy; el ítem activo se resalta en **verde FERO** con texto legible.

---

## 9. Documentación relacionada

- [Guión demo defensa](./guion-demo-defensa.md)
- [Diagrama navegación Opción A](./diagrama-navegacion-opcion-a.md)
- [Matriz responsabilidades](../fase-5/matriz-responsabilidades-modulos.md)
- [Checklist aceptación](../fase-0/checklist-aceptacion-defensa.md)
