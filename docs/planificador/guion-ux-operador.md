# Guión UX — Conductor / operador en campo (5–7 minutos)

**Audiencia:** evaluador de tesis / usuario conductor  
**Objetivo:** demostrar el loop ejecutor (campo) sin permisos de planificador  
**Ruta:** Hub → Mi ruta → Mapa → Incidencia → Resumen del día

---

## 0. Contexto (30 s)

> «Como conductor entro por **Mi operación**, no por optimización ni despacho. Veo qué hacer ahora, mi ruta de hoy y puedo reportar averías. No puedo cerrar el día ni alterar el plan.»

**Pantalla:** `/operator` (login: `conductor@fero.com` / `123456789`)

---

## 1. Hub «Mi operación» (1 min)

**URL:** `/operator`

| Qué mostrar | Mensaje clave |
|------------|---------------|
| «Qué hacer ahora» | Siguiente parada o estado de jornada |
| Mi jornada | Vehículo, avance %, estado del plan |
| Acciones rápidas | Monitoreo · Mapa mi ruta · Alertas · Reportar avería |
| Glosario campo | Mi ruta, parada, incidencia, avance |

**Guión:**  
«En dos clics sé si tengo ruta activa, en qué vehículo voy y cuál es el siguiente paso. Todo es consulta y ejecución en ruta — no planifico ni despacho.»

**Empty state:** sin despacho → «Sin ruta despachada» con enlace a monitoreo.

---

## 2. Mi ruta del día (1,5 min)

**URL:** `/operator` (panel «Mi ruta del día») o `/operator/plan`

| Elemento | Qué decir |
|----------|-----------|
| Stepper de paradas | Orden de visita, estado (visitada / pendiente / omitida) |
| Siguiente parada destacada | Badge «Siguiente» en la lista |
| Drawer de parada | Código, sector, dirección, ETA (solo lectura) |
| Enlaces | Abrir en monitoreo · Mapa mi ruta |

**Guión:**  
«Veo la secuencia completa de paradas de hoy. Toco una parada para el detalle sin poder reordenar ni eliminar puntos — eso lo hace planificación.»

**Puente:** «Mapa mi ruta» → `/map?date=…&vehicleId=…&focus=route`

---

## 3. Mapa contextualizado (1 min)

**URL:** `/map?date=…&vehicleId=…`

| Elemento | Qué decir |
|----------|-----------|
| Banner «Mi ruta hoy» | Vehículo, paradas hechas, próxima parada |
| Capa de ruta | Línea de mi jornada (no toda la flota) |
| Marcador próxima parada | Highlight en GIS |
| Contenedores filtrados | Solo puntos de mi ruta |

**Guión:**  
«El mapa responde a *¿qué me afecta a mí hoy?* — mi ruta, mis paradas, mi vehículo. No es la vista de supervisión de toda la ciudad.»

**Deep link monitoreo:** `/monitoring?date=…&vehicleId=…` desde hub o panel de ruta.

---

## 4. Incidencia — reportar avería (1,5 min)

**URL:** `/operator#reportar-averia` o monitoreo en modo campo

| Paso | Acción |
|------|--------|
| 1 | Vehículo preseleccionado (TR-08 en demo) |
| 2 | Detalle opcional (motor, neumático…) |
| 3 | «Reportar avería» → modal de confirmación |
| 4 | Banner de éxito + «Mis incidencias» |

**Guión:**  
«Si el vehículo no puede continuar, reporto la avería en campo. Planificación recibe la incidencia y revisa pendientes — yo no relanzo el optimizador.»

**Accesibilidad:** formulario con etiquetas, modal con foco en confirmación, mensaje `role="status"` al registrar.

---

## 5. Alertas que me afectan (30 s — opcional)

**URL:** `/alerts?scope=mine`

| Elemento | Qué decir |
|----------|-----------|
| Banner contextual | Prioridad: mi ruta, sector, averías propias |
| Empty state | «Sin alertas en tu ruta» |

**Guión:**  
«Solo veo avisos relevantes para mi vehículo, mis paradas o mi sector — no el tablero completo de supervisión.»

---

## 6. Resumen del día — cierre de jornada (1 min)

**URL:** `/operator/plan` o hub cuando planificación cerró el día

| Entregable | Mensaje |
|------------|---------|
| Paradas completadas | X / Y y % avance |
| Incidencias reportadas | Conteo últimas 48 h |
| Distancia recorrida | Km estimados (si hay dato) |
| Jornada cerrada | Banner solo lectura — sin «Cerrar día» |

**Guión:**  
«Al terminar la jornada veo un resumen simple. Si planificación cerró el día, queda en modo consulta: puedo revisar paradas e incidencias, pero no despachar ni cerrar.»

**Demo jornada cerrada (mocks):** en consola del navegador  
`localStorage.setItem('feromap.demo.operatorClosedDay', '1'); location.reload();`

---

## Checklist antes de la defensa

- [ ] Login conductor redirige a `/operator`
- [ ] Ruta del día con paradas y próxima destacada
- [ ] Mapa con capa «Mi ruta hoy»
- [ ] Una avería reportada con banner de confirmación
- [ ] Resumen del día visible en `/operator/plan`
- [ ] Sin botones «Cerrar día» / «Despachar» en vistas de conductor
- [ ] E2E `e2e/operator-flow.spec.ts` en verde

## Tiempos de referencia

| Bloque | Minutos |
|--------|---------|
| Contexto + Hub | 1 |
| Mi ruta del día | 1,5 |
| Mapa contextual | 1 |
| Incidencia | 1,5 |
| Alertas (opcional) | 0,5 |
| Resumen / cierre | 1 |
| **Total** | **~6,5** |

## Contraste con planificador

| Conductor | Planificador |
|-----------|--------------|
| `/operator` | `/planning` |
| Solo lectura del plan | Optimizar, despachar, cerrar |
| Reporta averías | Supervisa y reprograma |
| Mapa = mi ruta | Mapa = operación completa |
| Resumen de jornada | Analítica y checklist semanal |

Ver también: [guion-ux-planificador.md](./guion-ux-planificador.md)
