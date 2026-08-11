# Guión de demo de defensa (5–7 min)

**Audiencia:** tribunal / evaluadores de tesis  
**Rol demo:** Planificador (`plan@fero.com` / `123456789`)  
**Entorno:** `just setup` + `just migrate` + `just seed` + `just defense-verify`  
**URL:** http://localhost:5173 (dev) o http://localhost:8080 (prod)

---

## Mensaje clave (decir al inicio, ~30 s)

> «FEROMAP guía al planificador en un flujo de **simulación de escenarios**: configura condiciones, ejecuta el motor ACO y muestra el impacto medible. La **planificación operativa** es un módulo aparte para el despacho diario de rutas.»

No hace falta explicar “dos pantallas parecidas”: los banners y el menú ya orientan.

---

## Minuto a minuto

| Tiempo | Pantalla | Qué hacer | Qué decir |
|--------|----------|-----------|-----------|
| **0:00–0:45** | `/login` → `/` | Iniciar sesión como planificador | Dashboard con CTA **Nueva simulación** como entrada principal |
| **0:45–1:30** | `/simulation` paso 1 | Escenario **Tráfico pico** o toggles tráfico + saturación | Condiciones derivan el escenario; parámetros conectados (lluvia/desechos) cuando aplica |
| **1:30–2:00** | Paso 1 → **Continuar** | Revisar resumen lateral (vehículos, puntos) | Sistema valida recursos antes de ejecutar |
| **2:00–3:30** | Paso 2 | **Ejecutar simulación** — mostrar progreso y logs | Motor ACO (12 hormigas × 20 iteraciones) sobre grafo OSM de Unare |
| **3:30–4:30** | Paso 3 | KPIs comparativos, ahorro estimado, mapa | Resultado: distancia, tiempo, combustible, CO₂ evitado |
| **4:30–5:15** | Paso 3 acciones | **Ver en analítica** (deep link con `simulationId`) | Continuidad sin perder contexto |
| **5:15–5:45** | `/simulation?view=history` | Pestaña Historial — una corrida anterior | Historial de escenarios de tesis (no confundir con operativo) |
| **5:45–6:30** | `/optimization` (opcional) | Mostrar banner + **Generar ruta operativa** | «Aquí es operación del día; evaluación de escenarios está en Simulación» |
| **6:30–7:00** | `/reports` | Descargar CSV o PDF | Evidencia exportable para el capítulo de resultados |

**Duración total:** ~6–7 min (se puede acortar omitiendo Optimización).

---

## Escenario recomendado

1. **Condiciones:** Tráfico intenso + Lluvia → escenario derivado `rain` o `peak_traffic`.
2. **Intensidad de lluvia:** Alta (conectado al motor).
3. **Ejecutar** y destacar **% de ahorro en distancia** en el paso 3.

---

## Plan B (si el motor tarda)

- Tener una simulación previa en historial → abrir con `?simulationId=…`
- Mencionar que `just defense-verify` validó API + optimize antes de la sesión

---

## Cierre (~30 s)

> «El flujo es reproducible: configurar → ejecutar → interpretar → analítica/reporte. La separación Simulación / Planificación operativa está documentada en la matriz de responsabilidades (Opción A).»

---

## Checklist pre-demo (5 min antes)

- [ ] `just defense-verify` en verde
- [ ] Login planificador OK
- [ ] Pestaña del navegador en `/simulation`
- [ ] Sin ventanas de error en consola
- [ ] (Opcional) Una corrida previa en historial por si falla la red
