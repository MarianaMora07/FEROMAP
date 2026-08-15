# Guión UX — Planificador (10 minutos)

**Audiencia:** evaluador de tesis / usuario planificador  
**Objetivo:** demostrar el ciclo operativo completo sin confundir tesis y operación  
**Ruta:** Hub → Semana → Día → Monitoreo → Historial → Analítica (cierre)

---

## 0. Contexto (30 s)

> «FEROMAP separa **simulación de tesis** (escenarios, ACO comparativo) de **operación real** (plan semanal, día, monitoreo). Como planificador entro por el hub operativo, no por la simulación académica.»

**Pantalla:** `/planning` o dashboard → sección «Mi planificación»

---

## 1. Hub de planificación (1 min)

**URL:** `/planning`

| Qué mostrar | Mensaje clave |
|------------|---------------|
| «Qué hacer ahora» | Prioridad contextual (semana sin plan, día sin despachar, pendientes) |
| **Recorrido operativo del día** | CTA encadenado: Configurar semana → Optimizar hoy → Simular recorrido → Despachar → Monitorear |
| Tarjetas semana / hoy / pendientes / incidencias | Tres niveles: directivo, administrativo, operativo |
| Acciones rápidas | Plan semanal · Hoy · Pendientes · Historial · Monitoreo |

**Guión:**  
«Desde un solo lugar veo el estado de la semana, el día de hoy y los pendientes abiertos. El **stepper operativo** me guía paso a paso sin tener que recordar qué módulo abrir. El glosario recuerda que *semana* es directivo y *día* es administrativo.»

**Empty state:** si no hay plan semanal → CTA «Ir al plan semanal».

---

## 2. Plan semanal — nivel directivo (2 min)

**URL:** `/simulation?view=weekly`

| Paso stepper | Acción |
|--------------|--------|
| 1 Configurar días | Autocompletar desde frecuencias o editar puntos por día |
| 2 Validar (ACO) | Ejecutar validación de la semana |
| 3 Aprobar | Bloquear plan para operación |
| 4 Ir al día | Enlace al plan de hoy |

**Guión:**  
«Primero defino **qué visitar cada día**. Valido con el motor ACO, apruebo y solo entonces el equipo administrativo puede optimizar rutas diarias.»

**Empty state:** lista de semanas vacía → «Crear borrador semana actual».

---

## 3. Plan del día — nivel administrativo (2,5 min)

**URL:** `/optimization` (deep link con replay: `/optimization?date=2026-08-14&playback=1`)

| Elemento | Qué decir |
|----------|-----------|
| Calendario semanal | Estado por día (borrador → optimizado → despachado → cerrado) |
| Ciclo del día (stepper) | Abrir → Optimizar → Despachar → Cerrar |
| **Experiencia del día (banner)** | Paso 1 situación (escenario heredado + pendientes) → Paso 2 rutas → Paso 3 simulación de recorrido |
| Escenario heredado | Del plan semanal; override en «Condición operativa del día» antes de optimizar |
| Pendientes | Carry-over de días anteriores incorporados al plan |
| **Simular recorrido** | Preview animado del camión antes de despachar |
| Despachar rutas | CTA post-aprobación semanal |

**Guión:**  
«Con la semana aprobada, abro el día y veo el **escenario heredado** del plan semanal — puedo cambiarlo antes de optimizar. Incorporo pendientes, genero la ruta y **simulo el recorrido** en el mapa. El banner de experiencia me dice en qué paso estoy sin salir de esta pantalla. Luego despacho.»

**Empty state:** semana no aprobada → banner «Falta aprobar plan semanal» con enlace.

**Puente:** tras despachar → «Abrir monitoreo» con `date` y `dailyPlanId` en la URL.

---

## 4. Monitoreo — nivel operativo (1,5 min)

**URL:** `/monitoring?date=…&dailyPlanId=…` (replay: `&playback=1`)

| Elemento | Qué decir |
|----------|-----------|
| Banner «Supervisión operativa» | El planificador supervisa, no conduce |
| Plan del día en contexto | Mismo día que se despachó |
| **Reproducir ruta** | Replay del recorrido planificado (solo visual u híbrido con avance operativo) |
| Incidencias + trazabilidad inline | Incidencia → pendiente → plan siguiente |
| Volver al plan del día | Enlace bidireccional a optimización |

**Guión:**  
«Superviso flota e incidencias. Puedo **reproducir la ruta** que despachamos para explicar el recorrido sin pedir al tribunal que imagine el mapa. Si hay avería, veo la trazabilidad hasta el plan del día siguiente. Un clic me devuelve al plan administrativo.»

**Empty state:** sin vehículos despachados → «Despacha rutas desde optimización».

---

## 5. Historial unificado (1,5 min)

**URL:** `/planning/history`

| Filtro | Vista |
|--------|-------|
| Semana | Resumen de días y estados |
| Día | Plan + PDF + enlaces operativos |
| Incidencia | Trazabilidad completa |

**Guión:**  
«Un solo lugar para auditar: qué pasó en la semana, en un día concreto o siguiendo una incidencia.»

---

## 6. Cierre del ciclo — analítica (1 min)

**URL:** `/analytics` → sección «Planificación por nivel»

| Entregable | Mensaje |
|------------|---------|
| KPIs cumplimiento / carry-over | «Planifiqué → ejecuté → mido» |
| Resumen de la semana (PDF) | Informe para dirección |
| Checklist fin de semana | Días cerrados, pendientes, próxima semana, archivar |

**Guión:**  
«Al viernes reviso cumplimiento, descargo el resumen y uso el checklist guiado para archivar la semana.»

---

## Checklist antes de la defensa

- [ ] Plan semanal aprobado en datos de demo
- [ ] Al menos un día despachado para monitoreo con flota
- [ ] Una incidencia con trazabilidad visible
- [ ] Historial con semana actual cargada
- [ ] Analítica con rango de la semana actual

## Tiempos de referencia

| Bloque | Minutos |
|--------|---------|
| Contexto + Hub | 1,5 |
| Plan semanal | 2 |
| Plan del día | 2,5 |
| Monitoreo | 1,5 |
| Historial | 1,5 |
| Analítica / cierre | 1 |
| **Total** | **~10** |
