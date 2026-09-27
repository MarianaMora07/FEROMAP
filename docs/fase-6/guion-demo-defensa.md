# Guión de demo de defensa (6–8 min)

**Audiencia:** tribunal / evaluadores de tesis  
**Rol demo:** Planificador (`plan@fero.com` / `123456789`)  
**Entorno:** `just setup` + `just migrate` + `just seed` + `just defense-verify`  
**URL:** http://localhost:5173 (dev) o http://localhost:8080 (prod)

---

## Mensaje clave (decir al inicio, ~30 s)

> «FEROMAP guía al planificador en un flujo de **simulación de escenarios**: configura condiciones, ejecuta el cálculo de rutas paso a paso y muestra el impacto medible. El **Plan del día** (módulo operativo) lleva esas rutas al despacho diario.»

No hace falta explicar “dos pantallas parecidas”: los banners y el menú ya orientan.

---

## Minuto a minuto (con guion visual)

| Tiempo | Pantalla | Qué hacer | Qué decir (apoyado en la UI) |
|--------|----------|-----------|------------------------------|
| **0:00–0:45** | `/login` → `/` → `/simulation` | Iniciar sesión como planificador | Dashboard = hub del día (grupo **Tesis y demostración → Simulación ACO** para la evaluación del algoritmo) |
| **0:45–1:30** | `/simulation` paso 1 | Escenario **Tráfico pico** o toggles tráfico + saturación | «Aquí defino las condiciones del día: lluvia, avería, saturación… El sistema deriva el escenario automáticamente.» |
| **1:30–2:00** | Paso 1 → **Continuar** | Revisar resumen lateral (vehículos, puntos) | «Antes de calcular, valida que hay camiones y contenedores suficientes.» |
| **2:00–4:00** | Paso 2 | **Ejecutar simulación** | **Señalar el wizard:** aparece «Ejecutando — fase X de 8». **Stepper izquierdo:** 8 etapas en español claro. **Panel central:** «Qué está haciendo ahora» + barra de progreso real. **Mapa:** animación según la fase (red de calles → exploración → ruta final). |
| **4:00–4:30** | Paso 2 (opcional) | Pulsar **Cancelar ejecución** o **Esc** | «El usuario puede interrumpir; el sistema confirma y no guarda un resultado a medias.» (solo si quieres demostrar cancelación; luego re-ejecutar). |
| **4:30–5:30** | Paso 3 | KPIs comparativos, **desglose Viaje · Paradas · Total**, mapa | «El algoritmo minimiza **kilómetros**; la **duración** suma viaje más tiempo en paradas según la dotación. Aquí veo el desglose: viaje, paradas con dotación 6/6, y total.» |
| **5:30–6:15** | Paso 3 acciones | **Ver en analítica** (deep link con `simulationId`) | «Desde el resultado sigo el análisis sin perder el contexto de esta corrida.» |
| **6:15–6:30** | Paso 3 (opcional) | **Ver en plan del día** (si hay plan semanal aprobado) | «El escenario de tesis no se mezcla con operación; este enlace solo aparece cuando la semana está aprobada y lleva al plan administrativo.» |
| **6:30–7:00** | `/` (Dashboard-hub) | Stepper **Recorrido operativo del día** | «El hub encadena semana → plan del día → pendientes → monitoreo sin que yo recuerde URLs.» |
| **7:00–7:30** | `/optimization?playback=1` | Pestaña **Optimizar y despachar** — banner experiencia del día + **Simular recorrido** | «Mismo día: rutas generadas y replay animado antes de despachar.» |
| **7:30–8:00** | `/monitoring?dailyPlanId=…&playback=1` | **Reproducir ruta** en monitoreo | «Tras despachar, el replay operativo cierra la narrativa del camión en campo.» |
| **(alternativa)** | `/demostracion` | **Modo presentación (60 s)** o Iniciar demo → pestaña Convergencia | «Antes del mapa real, el laberinto muestra cómo el ACO explora, deposita feromonas y converge — mismo α, β y ρ que el motor de producción.» |
| **(alternativa)** | `/simulation?view=history` | Pestaña Historial — una corrida anterior | «Historial de escenarios de tesis; no es el despacho operativo del día.» |

**Duración total:** ~7–8 min (se puede acortar omitiendo cancelación u Optimización).

---

## Guión visual — paso 2 (lo más importante para el tribunal)

Usa esta secuencia al narrar mientras corre la ejecución:

1. **Wizard superior:** «Fase 3 de 8: Distancias y tiempos» — el evaluador sabe dónde estamos sin leer logs técnicos.
2. **Stepper (columna izquierda):** etapas completadas con ✓; la activa con spinner.
3. **Caja verde «Qué está haciendo ahora»:** explica en lenguaje llano (sin asumir que conocen VRP o ACO; las siglas aparecen entre paréntesis la primera vez).
4. **Mapa:** «Primero carga la red de calles reales; luego el algoritmo explora rutas; al final muestra la ruta optimizada.»
5. **Registro del cálculo:** mensajes del motor con etiqueta de etapa (opcional, si preguntan por trazabilidad).

**Frase de cierre del paso 2:**  
> «No es una barra genérica: cada fase corresponde a un hito real del motor en el servidor, con opción de cancelar.»

---

## Escenario recomendado

1. **Condiciones:** Tráfico intenso + Lluvia → escenario derivado `rain` o `peak_traffic`.
2. **Intensidad de lluvia:** Alta (conectado al motor).
3. **Ejecutar** y destacar **% de ahorro en distancia** en el paso 3.

---

## Demo dotación y ausentismo (Fase 8 — ~2 min, muy valorada en defensa)

**Mensaje clave:** misma ruta optimizada en **kilómetros**, distinta **duración** si faltan operarios de campo.

### Secuencia

1. **Corrida A — turno completo** (paso 1: ausentismo **desactivado**).
   - Ejecutar y llegar al paso 3.
   - Señalar el desglose: **Viaje · Paradas (6/6) · Total**.
   - Decir: «Con cuadrilla completa, cada parada toma 5 minutos de servicio (300 s).»

2. **Corrida B — mismo escenario + ausentismo** (paso 1: activar **Ausentismo del turno**, p. ej. **2 operarios de campo ausentes**).
   - Re-ejecutar **sin cambiar** condiciones de tráfico ni lluvia.
   - En paso 3, comparar:
     - **Distancia optimizada:** debe ser **igual o muy similar** (misma secuencia ACO).
     - **Paradas (4/6):** sube el tiempo en paradas; **Total** aumenta.
   - Decir: «El conductor siempre está en el camión; el ausentismo resta solo a los 5 operarios de campo. Con 2 ausentes, cada punto pasa de 5 min a **6 min** (360 s).»

3. **Cierre narrativo (posible segundo día):**
   > «La ruta sigue siendo la más corta en la red vial, pero la jornada ya no cierra: si el total supera las 8 h de referencia, el sistema avisa que haría falta **otro día de trabajo** — aunque los kilómetros no cambien.»

### Frases listas

- «El ACO minimiza **distancia**; los KPIs de **tiempo** incluyen el vaciado en cada contenedor.»
- «Menos operarios no empeora la ruta en el mapa; empeora la **factibilidad operativa del turno**.»

Documentación técnica: [docs/fase-8/adr-dotacion-tiempo-servicio.md](../fase-8/adr-dotacion-tiempo-servicio.md).

---

## Escena «Demostración ACO» (~2 min, ideal antes de simulación)

**Mensaje clave:** el tribunal entiende el algoritmo sin leer código ni logs del servidor.

### Secuencia

1. **Ir a** `/demostracion` (grupo **Tesis y demostración → Demostración ACO**).
2. **Pestaña Laberinto** (por defecto): pulsar **Modo presentación (60 s)** *o* **Iniciar demo**.
   - Narrar: «Cada hormiga elige el siguiente paso con probabilidad según feromonas (α) y distancia (β).»
   - Señalar el heatmap: azul = poca feromona, ámbar = mucha (contraste legible).
3. **Pestaña Convergencia**: curva de costo vs iteración y tabla laberinto vs VRP.
   - Decir: «El patrón de mejora gradual es el mismo que verán en el mapa real de Bucaramanga.»
4. **(Opcional)** Banner **Ir a simulación de escenarios** → transición a `/simulation`.

### Frases listas

- «Este laberinto usa los mismos parámetros del proyecto: α=1, β=3, ρ=0,12.»
- «Aquí optimizamos pasos en una grilla; en FEROMAP optimizamos kilómetros con capacidad y turno.»

Guion detallado: [docs/fase-11/guion-demo-aco.md](../fase-11/guion-demo-aco.md).

---

## Escena «Plan semanal → plan operativo» (opcional, ~2–3 min)

Si el tribunal quiere ver el flujo directivo real (semana completa):

| Pantalla | Qué hacer | Qué decir |
|---|---|---|
| `/planning/weekly` · Configurar días | Mostrar **zonas por día** (pills que añaden puntos, repetibles) y **flota por tipo** | «El plan semanal es la configuración base: aquí decido qué zonas se cubren cada día y con qué flota, sin tocar el algoritmo.» |
| Validar → Aprobar | Aprobar la semana | «Al aprobar queda congelada la cobertura.» |
| Paso final: **Generar plan operativo de la semana** | Correr la generación (Lun→Vie en secuencia) | «El sistema optimiza cada día con el motor real usando esa configuración y me deja la tabla Camión × Día.» |
| Tabla Camión × Día | Señalar filas/columnas + **Notificar** un día | «Veo qué camión sale cada día; notifico a los conductores y el estado queda persistido para Monitoreo.» |

> Precaución: el motor real tarda; ensaya con semana pequeña o deja generado el plan antes de la demo (Plan B abajo).

## Plan B (si el motor tarda)

- Tener una simulación previa en historial → abrir con `?simulationId=…`
- Mencionar que `just defense-verify` validó API + jobs de optimización antes de la sesión
- Mostrar al menos el **stepper y el sub-estado del wizard** aunque la corrida tarde; el progreso es consultable en tiempo real

---

## Cierre (~30 s)

> «El flujo es reproducible: configurar → ejecutar con transparencia → interpretar → analítica/reporte. La separación **Simulación ACO / Plan del día** está documentada en `docs/ux/arquitectura-navegacion.md` (grupos Tesis vs. operativo).»

---

## Checklist pre-demo (5 min antes)

- [ ] `just defense-verify` en verde
- [ ] Login planificador OK
- [ ] Pestaña del navegador en `/simulation`
- [ ] Sin ventanas de error en consola
- [ ] Probar una corrida con **ausentismo del turno** y ver desglose «Paradas (4/6)» en paso 3
- [ ] (Opcional) Probar Esc → confirmar cancelación
- [ ] (Opcional) Una corrida previa en historial por si falla la red
- [ ] (Opcional) `/demostracion` — modo presentación 60 s y curva de convergencia
- [ ] `npm test` (unit) en verde

---

## Pruebas automatizadas (Fase 7.5)

```bash
npm test              # unit: fases y cancelación en store/runner
npm run test:e2e      # requiere API en :8000 + VITE_USE_MOCKS=true en dev
npm run test:e2e -- e2e/demostracion.spec.ts   # flujo mínimo ACO didáctico
```
