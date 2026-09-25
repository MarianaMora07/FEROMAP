# Guión de demo de defensa — 10 minutos (Fase B4)

**Audiencia:** tribunal / evaluadores de tesis  
**Roles en vivo:** Presentador (tú) · Planificador · Conductor · Residente  
**Entorno:** local — `just up` + `just migrate` + `just seed`  
**URL:** http://localhost:5173 (dev) o http://localhost:8080 (prod)  
**Alcance congelado:** [alcance-demo-defensa.md](./alcance-demo-defensa.md)

---

## Criterios de salida (D24, D25)

| ID | Criterio | Cómo verificar |
|----|----------|----------------|
| **D24** | Ensayo cronometrado **≤ 10 min** en local | Registrar tiempos en [§ Registro de ensayo](#registro-de-ensayo) |
| **D25** | `just phase-a-flow` pasó **antes** del ensayo | Ejecutar la verificación de [§ Pre-vuelo](#pre-vuelo-d25) el mismo día del ensayo |
| **D7** | Tres módulos diferenciados (operación / simulación / demostración) | Bloques 2, 3 y 4–8 del guion |
| **D22** | Guion ejecutable sin improvisar | Seguir clics y frases de este documento |

---

## Pre-vuelo (D25)

**Cuándo:** mañana del ensayo o ≥ 30 min antes de la defensa. **No** ejecutar `phase-b-verify` justo antes de la demo en vivo (borra el estado que crearás en pantalla).

```bash
just up && just migrate && just seed
just phase-a-smoke
just phase-b-verify
```

Si `phase-b-verify` falla, **no ensayar** hasta corregir el entorno.

**Inmediatamente antes de la demo en vivo** (estado limpio para crear el plan en pantalla):

```bash
just seed
```

Abrir el navegador en **pantalla completa**, zoom **100 %**, sin extensiones que bloqueen el mapa.

---

## Credenciales y cambio de rol

| Rol | Botón en login | Email | Contraseña |
|-----|----------------|-------|------------|
| Planificador | **Planificador** | `plan@fero.com` | `123456789` |
| Conductor | **Conductor** | `conductor@fero.com` | `123456789` |
| Residente | **Residente** | `residente@fero.com` | `123456789` |

**Cambio de rol:** menú usuario (esquina superior) → **Cerrar sesión** → login con el siguiente rol.

**Atajo de ensayo (opcional):** tres ventanas de incógnito con cada rol; solo la del planificador hace el flujo completo hasta despacho; conductor y residente se refrescan al final.

---

## Qué no abrir en la demo

| Evitar | Motivo |
|--------|--------|
| `/analytics` | Oculto del menú; datos mock mezclan la narrativa |
| Caso `CE-COMBINATORIO` | Solo evidencia escrita (anexo) |
| Escenarios lluvia / saturación / avería | Alcance operativo congelado en `normal` |
| «Ruta óptima garantizada» | Ver [alineacion-defensa.md](../fase-0/alineacion-defensa.md) |

---

## Tabla resumen (10 min)

| Min | Rol | Pantalla | Acción |
|-----|-----|----------|--------|
| 0:00–0:30 | Presentador | — | Contexto: muestra metodológica, 120 puntos, flota completa |
| 0:30–2:00 | Planificador | `/demostracion` | ACO didáctico (convergencia) |
| 2:00–3:30 | Planificador | `/simulation` | Escenario normal, comparación KPIs (tesis) |
| 3:30–6:00 | Planificador | `/planning/weekly` | Borrador → autofill frecuencias → validar → aprobar |
| 6:00–7:30 | Planificador | `/optimization` | Elegir día → pendientes → optimizar → despachar |
| 7:30–8:30 | Conductor | `/operator/plan` | Paradas + mapa (TR-01) |
| 8:30–9:30 | Residente | `/resident` | Días, ventana, banner hoy, camión en camino |
| 9:30–10:00 | Presentador | `/planning` o mapa | Cierre: escala + limitaciones honestas del ACO |

---

## Bloque 0 — Contexto (0:00–0:30) · Presentador

**Pantalla:** ninguna (o slide de tesis) / dashboard sin profundizar.

**Frase de apertura (≤ 30 s):**

> «FEROMAP es un prototipo sobre la red vial real de Unare: **52 sectores**, **~120 puntos** de recolección y **flota completa** de diez vehículos. No prometemos optimalidad global: usamos **ACO** para obtener rutas de alta calidad y las comparamos con un **baseline operativo**. Verán tres piezas: **demostración didáctica** del algoritmo, **Simulación ACO (tesis)** con KPIs, y **operación** en vivo — plan semanal, día, despacho, conductor y residente.»

**Clic:** iniciar sesión como **Planificador** (`plan@fero.com`).

---

## Bloque 1 — Demostración ACO (0:30–2:00) · Planificador

**Ruta:** menú **Análisis → Demostración ACO** → `/demostracion`

| Paso | Clic / elemento | Qué decir |
|------|-----------------|-----------|
| 1 | Pestaña **Convergencia** (`demostracion-tab-convergencia`) | «Mismo motor conceptual que en producción: feromonas, exploración y refinamiento.» |
| 2 | Pestaña **Laberinto** → **Modo presentación (60 s)** *o* **Iniciar demo** | «Las hormigas exploran, depositan feromonas y la mejor ruta emerge — no es una animación decorativa.» |
| 3 | Al terminar (o a ~1:45), volver a **Convergencia** y señalar la curva | «Aquí la **curva de costo vs iteración**: el ACO mejora hasta estabilizarse; en operación eso se traduce en kilómetros y duración.» |
| 4 | Tabla laberinto vs VRP (misma pestaña) | «El laberinto enseña el mecanismo; el CVRP en Unare añade capacidad, vertedero y jornada.» |

**No improvisar:** si el modo presentación sigue corriendo, pulsar **Reiniciar** y pasar a Convergencia con la curva ya visible.

**Tiempo máximo:** 90 s. Si vas retrasado, omitir Laberinto y quedarte solo en Convergencia (30 s).

---

## Bloque 2 — Simulación ACO (tesis) (2:00–3:30) · Planificador

**Ruta:** menú **Análisis → Simulación ACO (tesis)** → `/simulation`

### Ruta A — en vivo (preferida en defensa)

| Paso | Clic / elemento | Qué decir |
|------|-----------------|-----------|
| 1 | Paso **1 — Configuración** | «Escenario **Normal** — condiciones de referencia de la tesis.» |
| 2 | Confirmar **sin** caso de estudio preseleccionado (catálogo completo) | «La simulación evalúa el motor sobre la muestra metodológica, no el turno operativo del día.» |
| 3 | **Continuar** → paso 2 | «Antes de calcular, el sistema valida flota y puntos.» |
| 4 | **Ejecutar simulación** (`execute-simulation-btn`) | Narrar el wizard: «Fase X de 8… red OSM → exploración ACO → ruta final.» |
| 5 | Paso **3 — Resultados** | Señalar **baseline vs ACO**: distancia, duración, cobertura. «El ACO minimiza **distancia**; el tiempo incluye paradas con dotación.» |

**Duración esperada del motor:** 60–120 s según hardware. Si a 3:15 aún ejecuta, decir: «El servidor sigue iterando; en el ensayo vimos el resultado en el paso 3» y avanzar al bloque 3 (el plan semanal puede correr en paralelo mental — en práctica, **esperar** o usar Ruta B).

### Ruta B — atajo de ensayo (si Ruta A supera 90 s)

| Paso | Clic |
|------|------|
| 1 | Pestaña / vista **Historial** en `/simulation` |
| 2 | Abrir la última corrida **Normal** completada |
| 3 | Misma narrativa de KPIs en paso 3 |

> Frase puente: «Para el tiempo del tribunal repito una corrida ya validada; el flujo en vivo es el que acaban de ver en demostración.»

---

## Bloque 3 — Plan semanal en vivo (3:30–6:00) · Planificador

**Ruta:** menú primario → **Plan semanal** → `/planning/weekly`

**Semana narrativa de referencia:** 2026-03-09 → 2026-03-13 ([alcance §3](./alcance-demo-defensa.md#3-semana-de-referencia-del-guion-d5-d16-d18)). En el prototipo se crea el borrador de la **semana actual** (lunes–viernes ISO); la narrativa al jurado usa marzo 2026.

| Paso | Clic / elemento (`data-testid`) | Qué decir |
|------|--------------------------------|-----------|
| 1 | **Borrador semana actual** (o **Nueva semana** si aplica) | «El plan directivo no viene precargado: lo creamos como haría la coordinación.» |
| 2 | Paso **1 — Configurar días** (`weekly-plan-step-1`) | «Escenario **Normal** para toda la semana operativa.» |
| 3 | **Autocompletar desde frecuencias** (`weekly-plan-primary-cta`) | «Distribuimos **~120 puntos** según frecuencias de visita en seeds — sin caso de estudio oculto.» |
| 4 | Revisar calendario semanal (`weekly-plan-week-calendar`) | «Carga equilibrada lun–vie; Unare I con lun / mié / vie.» |
| 5 | Paso **2 — Validar** → **Validar plan** (`weekly-plan-step-2`, CTA primario) | «Simulación rápida de la semana: cobertura y jornada antes de aprobar.» *Esperar fin (~30–60 s).* |
| 6 | Paso **3 — Aprobar** → **Aprobar plan semanal** (`weekly-plan-step-3`) | «Con la semana aprobada se habilita la optimización del día.» |
| 7 | Paso **4 — Ir al día** → enlace **Abrir plan de hoy** (si aparece) | «Seguimos al turno operativo.» |

**Si validación advierte jornada excedida:** «Es señal de carga realista; en operación se repartiría o se ajustaría dotación» — y **aprobar igual** si el flujo lo permite.

---

## Bloque 4 — Optimización y despacho (6:00–7:30) · Planificador

**Ruta:** `/optimization` (o CTA desde paso 4 del plan semanal)

| Paso | Clic / elemento | Qué decir |
|------|-----------------|-----------|
| 1 | Calendario semanal: elegir **cualquier día laborable** (lun–vie) | «Cualquier día de la semana aprobada es optimizable.» |
| 2 | Abrir la pestaña **Pendientes** (`plan-day-tab-pending`); la gestión se muestra directa | «Hay **carry-over** de días anteriores (CNT-016, CNT-017, CNT-018 en seed).» |
| 3 | Señalar lista en `pending-management-panel` | «Se incorporan al consolidar el día — no se pierden visitas fallidas.» |
| 4 | Cerrar pendientes; toolbar → **Generar** (`optimization-generate-route`) | «ACO operativo sobre red real + pendientes.» *Esperar barra de progreso (~30–90 s).* |
| 5 | Revisar el mapa y, en **Resultados → Previsto**, el panel de línea base (`optimization-comparison-panel`) | «La línea base del turno es la operación actual; el plan la mejora con las restricciones del día.» |
| 6 | Esperar el **despacho automático**: la barra muestra «Conductores notificados · N rutas» | «El despacho publica rutas a campo y al residente sin un paso manual.» |
| 7 | Banda de estado (BDC) de despacho → opcional **Ir a monitoreo** | «Una sola banda de estado confirma el despacho; el detalle vive en Monitoreo.» Solo si sobra tiempo. |

**Ancla demo:** tras optimizar, el vehículo **TR-01** debe tener al menos una parada (garantía de seed + servicio).

---

## Bloque 5 — Conductor (7:30–8:30) · Conductor

**Cambio de rol:** cerrar sesión → **Conductor** → `/operator/plan`

| Paso | Clic / elemento | Qué decir |
|------|-----------------|-----------|
| 1 | Vista **Plan del día** (`operator-daily-plan`) | «El conductor no optimiza: ejecuta la ruta despachada.» |
| 2 | Columna **Paradas** (`operator-stops-stepper`) | «Secuencia ordenada; estado visitado / pendiente.» |
| 3 | Columna **Mapa** (`operator-plan-map-card`, `operator-mobile-playback`) | «Misma geometría que planificó la oficina — TR-01 en ruta.» |
| 4 | (Opcional) Reproducir avance en mapa | «Playback para capacitación; en campo sería GPS en tiempo real.» |

**Si no hay paradas:** no improvisar — ejecutar `just seed`, repetir bloques 3–4 o usar ensayo con `phase-a-flow` previo solo para este bloque.

---

## Bloque 6 — Residente (8:30–9:30) · Residente

**Cambio de rol:** cerrar sesión → **Residente** → `/resident`

| Paso | Elemento (`data-testid`) | Qué decir |
|------|--------------------------|-----------|
| 1 | Hub (`resident-hub`) | «El residente solo consulta su sector — Unare I.» |
| 2 | **Horario de recolección** (`resident-schedule-card`) | «**Lunes, miércoles y viernes**, ventana **07:00–12:00**.» |
| 3 | Badge **Hoy hay recolección** (solo lun/mié/vie con plan aprobado) | Si hoy no es día de recolección: «El banner aparece en días de servicio; el calendario sigue siendo la fuente.» |
| 4 | **Estado del camión** (`resident-truck-status-card`) | «Tras el despacho: camión en camino, paradas antes de mi sector.» |
| 5 | Acción **Ver en mapa** (si visible) | «Proximidad sobre el mapa del sector, no la operación completa.» |

**Fuente de verdad:** horario desde **plan semanal aprobado** (bloque 3), no fallback genérico.

---

## Bloque 7 — Cierre (9:30–10:00) · Presentador

**Pantalla:** `/planning` (hub operativo) o mapa con rutas despachadas.

**Frase de cierre (≤ 30 s):**

> «Resumiendo: **120 puntos** y **10 vehículos** muestran la escala combinatoria real. El ACO entrega rutas **factibles y mejoradas** frente al baseline, con convergencia observable — pero **no garantiza** cubrir todos los puntos si la jornada o la flota no alcanzan, ni optimalidad global. La tesis aporta el motor, la comparación sistemática y este prototipo integrado de planificación a ciudadano.»

**Si preguntan por evidencia numérica:** remitir a casos de estudio en anexo (`CE-UNARE-NORTE`, etc.) — **no** abrir `CE-COMBINATORIO` en vivo.

---

## Atajos si el ensayo supera 10 min

Aplicar en orden hasta entrar en ventana:

1. Bloque 1: solo pestaña **Convergencia** (sin Laberinto).
2. Bloque 2: **Ruta B** (Historial).
3. Bloque 3: no expandir calendario día a día; solo CTA de autofill → validar → aprobar.
4. Bloque 4: no abrir monitoreo ni playback.
5. Bloque 5–6: 45 s cada uno (paradas + horario + camión, sin playback).

**Objetivo tras recorte:** ≥ 9:30 min narrados, ≤ 10:00 total.

---

## Registro de ensayo

Completar en cada ensayo cronometrado (D24):

| Bloque | Objetivo | Real | Notas |
|--------|----------|------|-------|
| 0 Contexto | 0:30 | | |
| 1 Demostración | 1:30 | | |
| 2 Simulación | 1:30 | | Ruta A / B |
| 3 Plan semanal | 2:30 | | |
| 4 Optimización | 1:30 | | |
| 5 Conductor | 1:00 | | |
| 6 Residente | 1:00 | | |
| 7 Cierre | 0:30 | | |
| **Total** | **≤ 10:00** | | |

| Fecha ensayo | `phase-a-flow` OK | Total ≤ 10 min | Observaciones |
|--------------|-------------------|----------------|---------------|
| | ☐ | ☐ | |

---

## Referencias

- [alcance-demo-defensa.md](./alcance-demo-defensa.md) — alcance B0 congelado
- [alineacion-defensa.md](../fase-0/alineacion-defensa.md) — narrativa académica y límites del ACO
- [guion-demo-defensa.md](../fase-6/guion-demo-defensa.md) — guion largo planificador (8 min)
- [guion-ux-residente.md](../residente/guion-ux-residente.md) — detalle UX residente
- Verificación automatizada: `just phase-a-flow`, `e2e/phase-a-operational-flow.spec.ts`
