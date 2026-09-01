# Guion oral — Casos de estudio (3 min)

**Audiencia:** tribunal / evaluador  
**Demo en vivo:** historial de simulación + mapa de rutas (opcional)  
**Evidencia impresa:** [evidencia-casos-estudio.md](./evidencia-casos-estudio.md)

---

## 0:00–0:30 — Problema y concepto

> «En FEROMAP un **escenario** describe condiciones globales — lluvia, tráfico, demanda general.  
> Pero la tesis también necesita **experimentos acotados**: subconjuntos de contenedores con condiciones locales reproducibles.  
> Eso es un **caso de estudio**: un código estable, por ejemplo `CE-UNARE-NORTE`, con sus puntos y overrides de llenado.  
> Sin casos, el motor optimizaba siempre todo el catálogo activo y cualquier simulación podía “contaminar” el llenado global.»

**Mostrar (opcional):** UI → Casos de estudio → lista con conteo de puntos.

---

## 0:30–1:15 — Aislamiento: mismo punto, dos casos

> «El diseño permite **M:N**: un contenedor puede estar en varios casos.  
> Tomemos **`CNT-006`**, que aparece tanto en CE-UNARE-NORTE como en CE-UNARE-SUR.  
> En el catálogo tiene **una sola** ubicación y un llenado “real” del sistema.  
> En cada caso, la membresía puede definir **demanda distinta solo para ese experimento** — sin escribir en `collection_points`.»

**Comando (terminal o slide):**

```bash
pytest tests/test_case_study_isolation.py -v
```

> «El test verifica demandas distintas, coordenadas iguales, y que optimizar el Caso Norte **no altera** el catálogo ni las membresías del Caso Sur.»

---

## 1:15–2:15 — Dos rutas, dos instancias VRP

> «Cuando ejecuto el ACO con `caseStudyId`, el motor arma una instancia VRP **solo con los puntos activos del caso** y aplica overrides en memoria.  
> Mismo `CNT-006`, dos corridas → **dos rutas** porque cambian demanda, vecindario de puntos y costos.  
> Eso es la evidencia central: reproducibilidad sin mezclar experimentos.»

**Comando:**

```bash
just case-study-report CE-UNARE-NORTE
just case-study-report CE-UNARE-SUR
```

> «Cada reporte muestra KPIs, convergencia ACO y secuencia por conductor. Comparen dónde queda `CNT-006` en la ruta.»

**Tabla comparativa (generada):**

```bash
just phase12-evidence
```

> «El script deja la tabla en `docs/fase-12/evidencia-casos-estudio.md` con distancias, demandas del punto compartido y simulación ID para auditoría.»

---

## 2:15–3:00 — Cierre: trazabilidad e integración

> «Cada simulación guarda `case_study_id` y metadatos en `parameters_json` — el historial filtra por caso.  
> El plan semanal (Fase 12.6) puede vincularse al mismo caso: los días heredan puntos y overrides al validar y al optimizar el día.  
> **Conclusión:** caso de estudio ≠ escenario climático; caso = *qué puntos y con qué condiciones locales*; escenario = *cómo se comporta la red ese día*.  
> Preguntas.»

---

## Respuestas rápidas (30 s cada una)

| Pregunta | Respuesta |
|----------|-----------|
| «¿Duplican contenedores en BD?» | No. M:N en `case_study_points`; un `collection_point` físico. |
| «¿Qué pasa sin caso?» | Legacy: todos los puntos activos (compatibilidad). |
| «¿Cómo demuestran que no hay contaminación?» | Pytest de aislamiento + rollback en scripts de reporte. |
