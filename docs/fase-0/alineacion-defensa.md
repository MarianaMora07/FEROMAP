# Fase 0 — Alineación pre-defensa

**Estado:** congelado  
**Fecha:** 2026-08-27  
**Responsables:** Victor Astudillo · Mariana Mora  
**Criterio de salida:** alcance acordado + KPIs de referencia reproducibles

---

## 1. Narrativa académica

> **FEROMAP entrega soluciones de alta calidad mediante metaheurística ACO (Colonia de Hormigas) sobre la red vial real de la parroquia Unare, comparadas sistemáticamente con una ruta baseline operativa de referencia.**

### Cómo presentarlo al jurado

| Decir | Evitar |
|-------|--------|
| “Solución de alta calidad encontrada por ACO” | “Ruta óptima garantizada” |
| “Comparación contra baseline operativo” | “Mejor que cualquier alternativa posible” |
| “Heurística con convergencia observable” | “Inteligencia artificial que siempre mejora la distancia” |

El motor resuelve un **CVRP** (ruteo con capacidad, múltiples vehículos, vertedero y jornada laboral), no un TSP simple. La calidad se demuestra con **cobertura**, **factibilidad operativa** y **mejora iterativa del ACO**, además del ahorro en kilómetros cuando el escenario lo permite.

---

## 2. Alcance congelado (defensa 2025–2026)

### Incluido ✅

- Grafo vial OSM de Unare (OSMnx + NetworkX)
- Matriz de costos depot · contenedores · vertedero
- CVRP multi-vehículo con ACO + refinamiento 2-opt
- Viajes al vertedero por capacidad (multi-trip)
- Jornada operativa 06:00–18:00
- Escenarios: normal, tráfico pico, lluvia, saturación, avería
- Simulación (tesis) y planificación operativa diaria
- Despacho, monitoreo, playback y contingencias (avería, contenedor crítico)
- Comparación baseline vs solución ACO en KPIs

### Excluido antes de la defensa ❌

| Ítem | Motivo |
|------|--------|
| **VRPTW** (ventanas horarias) | Toggle en UI deshabilitado; sin lógica en el solver |
| **Optimización multi-objetivo** | El ACO minimiza distancia; CO₂/tiempo son KPIs derivados (`kpiView`) → [backlog](../post-grado/multi-objetivo-solver.md) |
| **OR-Tools u otro solver exacto** | Fuera de alcance; solo ACO en producción → [backlog post-grado](../post-grado/or-tools-baseline.md) |
| **Tráfico en vivo** (OSRM, Google, Waze) | Solo multiplicadores de escenario → [backlog post-grado](../post-grado/trafico-en-vivo.md) |
| **Algoritmos GA / SA** | Eliminados del UI operativo; restos solo en mocks |
| **Garantía de cobertura total** | El solver puede dejar puntos no cubiertos si la flota o jornada no alcanzan |

Cualquier ampliación posterior (Fases 1–4 del plan de fortalecimiento) **no modifica** este alcance base sin actualizar este documento.

**Roadmap post-grado / producción:** ítems explícitamente diferidos hasta después de la defensa → [docs/post-grado/README.md](../post-grado/README.md).

---

## 3. KPIs de referencia (baseline de métricas)

**Condiciones de generación**

| Parámetro | Valor |
|-----------|-------|
| Perfil ACO | 12 hormigas × 20 iteraciones (estándar) |
| Contenedores activos | 20 |
| Entorno | `just migrate` + stack dev (`feromap-api`) |
| Comando | `just phase0-baseline` |
| Artefacto JSON | `data/cache/phase0-baseline-metrics.json` |

**Corridas — 2026-08-27**

| Escenario | Distancia baseline (km) | Distancia ACO (km) | Tiempo baseline (h) | Tiempo ACO (h) | Puntos no cubiertos | CO₂ evitado (kg) | Viajes vertedero |
|-----------|-------------------------|--------------------|--------------------|----------------|---------------------|------------------|------------------|
| **normal** | 29,0 | 31,1 | 2,37 | 2,85 | 0 | 0,0 | 0 |
| **lluvia** (`rain`) | 29,0 | 31,1 | 2,37 | 2,85 | 0 | 0,0 | 0 |
| **saturado** (`saturated`) | 29,0 | 44,8 | 2,37 | 3,66 | 0 | 0,0 | 4 |

**Tiempo de cómputo:** ~8 s por escenario (grafo + matriz en caché).

### Interpretación honesta

1. **Cobertura 100 %** en los tres escenarios con la flota demo actual.
2. **Ahorro negativo en km** no invalida el sistema: el baseline recorre los 20 puntos en orden fijo por código con un modelo simplificado; la solución ACO reparte en varios vehículos y, en saturación, **obliga 4 viajes al vertedero** — operación real que el baseline no refleja en distancia.
3. **Lluvia vs normal** produce la misma ruta en esta corrida porque el escenario modifica tiempos en aristas, no la topología; el impacto se ve en duración de viaje, no necesariamente en el orden de visita.
4. Estos números son la **línea base para Fase 3** (benchmark y sensibilidad ACO); regenerar tras cambios de seeds, flota o parámetros ACO.

---

## 4. Mensajes clave para demo en vivo

1. Mostrar **simulación** con gráfico de convergencia ACO (no solo el resultado final).
2. En escenario **normal**, destacar cobertura y distribución multi-vehículo.
3. En escenario **saturado**, explicar viajes al vertedero antes de comparar kilómetros.
4. Usar el término **“mejor ruta encontrada”**, no “óptima”.
5. Si preguntan por ventanas horarias u OR-Tools → remitir a la tabla de exclusión (§2).

---

## 5. Regenerar métricas

```bash
just up
just migrate
just phase0-baseline
```

Actualizar la tabla de la §3 y la fecha de este documento si los valores cambian.

---

## Referencias

- [matriz-variables-motor.md](./matriz-variables-motor.md)
- [checklist-aceptacion-defensa.md](./checklist-aceptacion-defensa.md)
- [guion-demo-defensa.md](../fase-6/guion-demo-defensa.md)
- `data/cache/phase0-baseline-metrics.json`
