# Guión UX — Residente / Mi Recolección (5–7 minutos)

**Audiencia:** evaluador de tesis / usuario residente  
**Objetivo:** demostrar el loop ciudadano (consulta) sin permisos de planificación, monitoreo ni flota  
**Ruta:** Hub → Horario → Proximidad → Mapa → Alertas → Puntos  
**Casos de uso:** UC-R1 horario · UC-R2 proximidad · UC-R3 mapa (diagrama `docs/casos-de-uso/residente.puml`)

---

## 0. Contexto (30 s)

> «Como residente entro por **Mi Recolección**, no por planificación ni monitoreo de flota. Veo el horario de paso del camión en mi sector, si está en camino y dónde está en el mapa. Solo consulto — no optimizo rutas ni reporto averías.»

**Pantalla:** `/resident` (login: `residente@fero.com` / `123456789`)

**Menú lateral (4 ítems):** Mi Recolección · Mapa mi sector · Puntos de recolección · Alertas (+ Perfil abajo)

---

## 1. Hub «Mi Recolección» (1 min)

**URL:** `/resident`

| Qué mostrar | Mensaje clave |
|------------|---------------|
| «Qué hacer ahora» | Próxima recolección, camión en camino o recolección en curso |
| Mi sector | Nombre, puntos de recolección, contenedores críticos |
| Acciones rápidas | Mapa mi sector · Alertas · Puntos de recolección |
| Glosario ciudadano | Sector, ventana horaria, camión en camino, contenedor crítico |

**Guión:**  
«En dos clics sé cuándo pasa el camión por mi barrio y si hay recolección activa hoy. Todo es consulta sobre *mi sector* — no veo la operación de toda la ciudad.»

**Empty state — sin sector asignado:**  
«Tu cuenta no tiene sector asignado. Contacta a la administración municipal.»

**Empty state — sin ruta hoy:**  
«No hay camión en ruta ahora. La próxima recolección está según el calendario del sector.» → enlace a bloque Horario.

---

## 2. Horario de paso del camión — UC-R1 (1 min)

**URL:** `/resident` (tarjeta «Horario de recolección»)

| Elemento | Qué decir |
|----------|-----------|
| Días de recolección | L-M-V (según sector) |
| Ventana horaria | 07:00 — 12:00 |
| Próxima recolección | Fecha y hora destacada |
| Badge «Hoy hay recolección» | Visible en días de servicio |

**Guión:**  
«Consulto **cuándo** pasa el camión por mi zona: días fijos, franja horaria y la próxima fecha programada. Es la información que necesito para sacar la basura a tiempo.»

**Empty state — sin calendario:**  
«Tu sector aún no tiene recolección programada esta semana.»

**Puente:** acción rápida «Puntos de recolección» → `/collection-points`

---

## 3. Proximidad del camión — UC-R2 (1 min)

**URL:** `/resident` (tarjeta «Estado del camión» / «Camión en camino»)

| Estado | Mensaje | CTA |
|--------|---------|-----|
| En camino | «TR-08 llega en ~15 min — 3 paradas antes de tu sector» | Ver en mapa |
| En tu sector | «Recolección en curso en Unare I» | Ver avance |
| Completado hoy | «El camión ya pasó por tu sector hoy» | Ver horario |
| Sin ruta activa | «No hay camión en ruta ahora» | Próxima recolección |

**Guión:**  
«Además del calendario, veo si el camión **ya va hacia mi barrio**: cuánto falta, qué vehículo es y cuántas paradas quedan antes de llegar a mi sector.»

**Empty state — fuera de ventana horaria:**  
«Fuera del horario de recolección (07:00–12:00). Consulta el calendario para la próxima visita.»

**Puente:** «Ver en mapa» → `/map?scope=sector&focus=truck`

---

## 4. Mapa mi sector — UC-R3 (1 min)

**URL:** `/map?scope=sector`

| Elemento | Qué decir |
|----------|-----------|
| Banner «Mi sector» | Nombre del sector del residente |
| Contenedores | Solo puntos de mi zona (solo lectura) |
| Ruta activa | Línea de la ruta que atiende el sector hoy |
| Marcador camión | Posición del vehículo asignado (si hay ruta) |
| Próxima parada | Highlight en el sector |

**Guión:**  
«El mapa responde a *¿qué me afecta a mí?* — mi sector, los contenedores de mi barrio y el camión que viene o está recolectando. No es la vista de supervisión de toda la flota municipal.»

**Deep link desde hub:** `/map?scope=sector&focus=truck` o `focus=routes`

**Contraste con conductor:** el conductor ve *su ruta completa*; el residente ve *su sector* y el tramo de ruta que lo atiende.

---

## 5. Alertas de mi sector (30 s)

**URL:** `/alerts?scope=sector`

| Elemento | Qué decir |
|----------|-----------|
| Banner contextual | «Avisos de tu sector — Unare I» |
| Tipos | Retraso de ruta, contenedor crítico, cambio de horario |
| Empty state | «Sin avisos en tu sector» |

**Guión:**  
«Solo veo alertas que afectan mi barrio — retrasos, contenedores llenos o cambios de horario. No el tablero interno de planificación.»

**Puente desde hub:** acción rápida «Alertas» → `/alerts?scope=sector`

---

## 6. Puntos de recolección en mi sector (30 s)

**URL:** `/collection-points`

| Elemento | Qué decir |
|----------|-----------|
| Banner sector | «Viendo puntos de {sector}» |
| Lista / mapa | Contenedores con nivel de llenado (solo lectura) |
| Sin CRUD | Sin botones crear/editar/eliminar |

**Guión:**  
«Puedo revisar los contenedores de mi zona y su estado. No puedo modificarlos — eso lo hace planificación.»

**Puente:** «Volver a Mi Recolección» → `/resident`

---

## Checklist antes de la defensa

- [x] Login residente redirige a `/resident`
- [x] Menú lateral con 4 ítems (sin Dashboard, simulación, monitoreo, vehículos ni planificación)
- [x] Hub con «Qué hacer ahora» contextual, sector, horario y rutas que atienden el sector
- [x] UC-R1: horario de paso visible (días, ventana, próxima recolección)
- [x] UC-R2: proximidad / estado del camión (con plan despachado en demo)
- [x] UC-R3: mapa filtrado a mi sector con camión y contenedores
- [x] Alertas con `scope=sector` sin avisos de otros sectores
- [x] Puntos de recolección en solo lectura con banner de sector
- [x] Sin acceso a `/planning`, `/optimization`, `/monitoring`, `/simulation`
- [x] E2E `e2e/resident-flow.spec.ts` en verde

## Checklist demo en vivo (5–7 min)

1. Login `residente@fero.com` → `/resident`
2. Hub: «Qué hacer ahora» → horario → camión → rutas/contenedores
3. Horario y próxima recolección (tarjeta o franja en dashboard)
4. Proximidad / camión en camino (seed con plan despachado)
5. Mapa mi sector: camión + contenedores (`/map?scope=sector`)
6. Alertas filtradas (`/alerts?scope=sector`)
7. Confirmar que no hay acceso a planificación, monitoreo ni simulación
8. Antes de la defensa: `npm run test:e2e -- e2e/resident-flow.spec.ts`

## Tiempos de referencia

| Bloque | Minutos |
|--------|---------|
| Contexto + Hub | 1 |
| Horario (UC-R1) | 1 |
| Proximidad (UC-R2) | 1 |
| Mapa sector (UC-R3) | 1 |
| Alertas | 0,5 |
| Puntos de recolección | 0,5 |
| **Total** | **~5** |

## Contraste con otros roles

| Residente | Conductor | Planificador |
|-----------|-----------|--------------|
| `/resident` | `/operator` | `/planning` |
| Consulta horario y proximidad | Ejecuta ruta en campo | Planifica y despacha |
| Mapa = mi sector | Mapa = mi ruta | Mapa = operación completa |
| Solo lectura | Reporta averías | Optimiza, cierra día |
| 4 ítems de menú | 4 ítems de menú | Nav operativa completa |

## Implementación por fases

| Fase | Entregable | Estado |
|------|------------|--------|
| 0 | Nav reducida + este guión | ✅ |
| 1 | Hub + capa `src/core/resident/` | ✅ |
| 2 | Horario desde plan semanal | ✅ |
| 3 | Proximidad / ETA camión | ✅ |
| 4 | Modo mapa `scope=sector` | ✅ |
| 5 | Alertas filtradas por sector | ✅ |
| 6 | Dashboard y puntos (solo lectura) | ✅ |
| 7 | Backend, tests unitarios y E2E | ✅ |
| 8 | Pulido UX, jerarquía mobile-first, demo defensa | ✅ |

Ver también: [guion-ux-operador.md](../planificador/guion-ux-operador.md) · [guion-ux-planificador.md](../planificador/guion-ux-planificador.md)
