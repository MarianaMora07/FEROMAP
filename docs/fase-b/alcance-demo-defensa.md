# Fase B — Alcance de la demo de defensa

**Estado:** congelado (B0)  
**Fecha:** 2026-09-04  
**Responsables:** Victor Astudillo · Mariana Mora  
**Entorno:** local (`just up` + `just seed`)  
**Criterio de salida B0:** lista de sectores y calendario Unare I acordados en este documento.

---

## 1. Frase única (tres módulos)

| Módulo | Ruta | Qué es |
|--------|------|--------|
| **Operación** | `/planning`, `/optimization`, `/operator`, `/resident` | Planes reales: semana directiva → día administrativo → despacho → chofer y residente. |
| **Simulación** | `/simulation` | Experimento de tesis: escenario `normal`, comparación baseline vs ACO, KPIs. |
| **Demostración** | `/demostracion` | Didáctica ACO: convergencia del algoritmo (sin confundir con el turno operativo). |

> **Regla de oro:** la simulación evalúa el motor; la operación entrega planes al equipo de campo; la demostración explica cómo aprende el ACO.

---

## 2. Alcance de datos (D1, D3, D4, D23)

| Parámetro | Valor congelado |
|-----------|-----------------|
| Muestra | **Metodológica completa** en prototipo: **52 sectores**, **~120 puntos** activos (`data/seeds/`) |
| Escenario operativo | Solo **`normal`** (defensa actual) |
| Flota demo | **Completa**: 10 vehículos, 8 conductores (seeds) |
| Vertedero / depósito | Coordenadas operativas del seed (`-62.715`, `8.295`) |
| Puntos focales tesis (67) | Narrativa Cap. IV; el prototipo escala a 120 para mostrar **dificultad combinatoria** sin depender aún de levantamiento GPS masivo |

---

## 3. Semana de referencia del guion (D5, D16, D18)

| Campo | Valor |
|-------|-------|
| **Semana congelada (narrativa)** | Lunes **2026-03-09** → Viernes **2026-03-13** |
| **Creación del plan** | **En vivo** en la demo (borrador → validar → aprobar); no se asume plan pre-cargado en BD |
| **Día optimizable** | **Cualquiera** de los 5 días laborables (lun–vie de esa semana) |
| **Pendientes** | **Sí** — incorporar carry-over antes de optimizar el día (demo realista) |

**Calendario de referencia**

| Fecha | Día | Uso en guion |
|-------|-----|----------------|
| 2026-03-09 | Lunes | Recolección **Unare I** (residente); día válido para optimizar |
| 2026-03-10 | Martes | Día válido para optimizar |
| 2026-03-11 | Miércoles | Recolección **Unare I** (residente) |
| 2026-03-12 | Jueves | Día válido para optimizar |
| 2026-03-13 | Viernes | Recolección **Unare I** (residente) |

---

## 4. Residente demo — Unare I (D12–D15)

| Parámetro | Valor |
|-----------|-------|
| Usuario | `residente@fero.com` / `123456789` |
| Sector | **Unare I** |
| Días de recolección | **Lunes, miércoles y viernes** |
| Ventana horaria | **07:00 — 12:00** |
| Banner | **«Hoy hay recolección»** cuando la fecha cae en lun/mié/vie y existe plan semanal aprobado con puntos del sector |
| Proximidad del camión | **Sí** — visible tras **despachar** el plan del día (ruta activa hacia el sector) |
| Fuente de horario | Plan semanal aprobado (no fallback genérico durante la demo) |

---

## 5. Chofer demo (D9–D11)

| Parámetro | Valor |
|-----------|-------|
| Pantallas | `/operator/plan` — **lista de paradas** + **mapa** |
| Conductor preferido | `conductor@fero.com` (aceptable el asignado por ACO si no es el demo) |
| Vehículo ancla | **TR-01** debe tener **siempre** al menos una ruta tras optimizar el día |
| Rol en guion | Segundo o tercer rol (junto a planificador y residente) |

---

## 6. Qué se muestra y qué no (D6, D8)

### Mostrar en la defensa (10 min)

- Hub y ciclo operativo: `/planning` → plan semanal → `/optimization` → despacho → `/operator` → `/resident`
- Simulación ACO (tesis) (`/simulation`, escenario `normal`)
- Demostración ACO (`/demostracion`)
- Mapa operativo con rutas despachadas
- Pendientes incorporados al plan del día
- Evidencia de casos de estudio (anexo; ver §8)

### No mostrar en la demo en vivo

| Ítem | Motivo |
|------|--------|
| **`/analytics`** con datos mock | Mezcla datos ficticios con narrativa operativa |
| Caso **`CE-COMBINATORIO`** en UI operativa | Stress test de 120 puntos; va a **evidencia escrita**, no al guion oral |
| Escenarios lluvia / saturado / avería | Fuera del alcance operativo congelado (solo `normal`) |
| Promesa de «ruta óptima garantizada» | Ver [alineacion-defensa.md](../fase-0/alineacion-defensa.md) |

---

## 7. Lista cerrada de sectores — muestra metodológica (D2)

### 7.1 Núcleo citado en Cap. III (tesis)

Correspondencia con el eje urbano central (Avenidas Guayana y Atlántico):

| Zona tesis | Sectores en FEROMAP (seeds) |
|------------|----------------------------|
| Unare I | Unare I |
| Unare II | Unare II |
| Unare III | UD 292, Guamo A-B-C, Las palmeras I y II, Yara Yara I y II *(agrupación representativa)* |
| Río Aro | Rio Aro |
| Río Caura | Rio Caura |
| Ventuari | Ventuari |
| Curagua | Curagua B, Bloques de Curagua |
| El Caimito | El caimito 1-2-3-4 |
| Villa Ikabarú | Villa Ikabaru |

### 7.2 Lista completa — 52 sectores del prototipo

Fuente única: `data/seeds/sectors.json` (parroquia Unare).

1. Altos de Caroní · 2. Barrio Guayana · 3. Bloques de Curagua · 4. Camino Real · 5. Caujaro · 6. Colegio Integral Guayana · 7. Curagua B · 8. Don Guillermo · 9. El caimito 1-2-3-4 · 10. El tiamo Country Club · 11. Guamo A-B-C · 12. Isla Bonita · 13. Isla Coral · 14. Isla Dorada · 15. La Pastoreña · 16. Las Garzas · 17. Las Mercedes · 18. Las Peonias · 19. Las palmeras I y II · 20. Lomas del caroni · 21. Los Bucares · 22. Los Rosales · 23. Manuelita Saenz · 24. Mini fincas · 25. Paratepuy · 26. Res Caroni plaza A-B-C-D · 27. Res. Atlantico Plaza · 28. Res. Prasanthy country · 29. Rio Aro · 30. Rio Caura · 31. Rio Cuyuní · 32. Rio Yocoima · 33. Rio negro · 34. Sierra Parima · 35. Terrazas del aluminio · 36. Terrazas del caroni A-B-C · 37. UD 292 · 38. Uchire · 39. Unare I · 40. Unare II · 41. Urb. Sur Aeropuerto · 42. Urb. Villa del Caroní · 43. Ventuari · 44. Villa Apso · 45. Villa Betania · 46. Villa Caroni · 47. Villa Guayana · 48. Villa Ikabaru · 49. Villa Victoria · 50. Villa Yenisha · 51. Yara Yara I y II · 52. Yuruani

---

## 8. Casos de estudio y evidencia (D20–D21)

| Código | Uso en defensa |
|--------|----------------|
| CE-UNARE-NORTE | Demo acotada / ensayo rápido |
| CE-UNARE-SUR | Evidencia comparativa |
| CE-MULTI-VIAJE | Evidencia multi-viaje al vertedero |
| CE-COMBINATORIO | **Solo anexo** (`just case-study-report`, `just phase12-evidence`) |

Regenerar antes de la defensa:

```bash
just phase-b-evidence
```

Consolidado: [evidencia-demo-defensa.md](./evidencia-demo-defensa.md) (tabla 4 casos + reportes en `reportes/`).

Equivalente manual:

```bash
just case-study-report CE-UNARE-NORTE
just case-study-report CE-UNARE-SUR
just case-study-report CE-MULTI-VIAJE
just case-study-report CE-COMBINATORIO
just phase12-evidence
```

---

## 9. Verificación previa a la demo (D25)

```bash
just up && just migrate && just seed
just phase-a-smoke
just phase-b-verify    # Fase A + checks B1–B3 (autofill, TR-01, residente, menú demo)
```

Checks rápidos sin ACO lento: `just phase-b-check`

Guion detallado (10 min): [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md) — ensayo cronometrado ≤ 10 min (D24) tras `phase-b-verify` OK.

Evidencia académica (D20–D21): `just phase-b-evidence` → [evidencia-demo-defensa.md](./evidencia-demo-defensa.md)

### Criterio de salida Fase B (global)

| Ítem | Verificación |
|------|----------------|
| Guion 10 min ensayado 2× sin fallos | Manual — [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md) |
| `just phase-a-flow` + `just phase-b-verify` en verde | Automático |
| Evidencia 4 casos regenerada | `just phase-b-evidence` |
| TR-01 con ruta; residente Unare I con días y proximidad | `test_phase_b_verify` / `test_phase_b_operator_resident` |
| `/analytics` y CE-COMBINATORIO fuera del flujo demo | `permissions.test.ts` + `test_combinatorio_not_demo_visible` |

---

## 10. Aprobación B0

| Ítem | Victor | Mariana |
|------|:------:|:-------:|
| Lista cerrada §7 | ☐ | ☐ |
| Semana 2026-03-09 — 2026-03-13 | ☐ | ☐ |
| Unare I: lun / mié / vie, 07:00–12:00 | ☐ | ☐ |
| Tres módulos (operación / simulación / demostración) | ☐ | ☐ |

---

## Referencias

- [evidencia-demo-defensa.md](./evidencia-demo-defensa.md) — anexo B5 (D20–D21)
- [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md) — guion 10 min (B4)
- [alineacion-defensa.md](../fase-0/alineacion-defensa.md)
- [guion-ux-planificador.md](../planificador/guion-ux-planificador.md)
- [guion-ux-residente.md](../residente/guion-ux-residente.md)
- `data/seeds/sectors.json`, `data/seeds/collection_points.json`
