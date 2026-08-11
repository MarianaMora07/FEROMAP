# Evidencias para capítulo de implementación

Material de apoyo para el capítulo de implementación / anexos de tesis.

---

## 1. Diagramas (incluir en tesis)

| Diagrama | Archivo | Uso sugerido |
|----------|---------|--------------|
| Navegación Opción A | [diagrama-navegacion-opcion-a.md](./diagrama-navegacion-opcion-a.md) | Figura: arquitectura de navegación UX |
| Flujo UX simulación | [ux-flujo-simulacion.md](../fase-0/ux-flujo-simulacion.md) | Figura: flujo canónico planificador |
| Casos de uso planificador | [planificador.puml](../casos-de-uso/planificador.puml) | Anexo UML |
| ADR Simulación principal | [adr-001-simulacion-principal.md](../fase-0/adr-001-simulacion-principal.md) | Tabla decisión arquitectónica |
| Matriz variables motor | [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md) | Tabla honestidad funcional |

---

## 2. Capturas recomendadas

Guardar en `docs/fase-6/capturas/` con nombres descriptivos.

| # | Pantalla | Nombre archivo sugerido | Qué debe verse |
|---|----------|-------------------------|----------------|
| 1 | Dashboard | `01-dashboard-cta-simulacion.png` | CTA Nueva simulación + última simulación |
| 2 | Simulación paso 1 | `02-simulacion-configuracion.png` | Escenario, condiciones, panel lateral |
| 3 | Simulación paso 2 | `03-simulacion-ejecucion.png` | Progreso y logs ACO |
| 4 | Simulación paso 3 | `04-simulacion-resultados-kpi.png` | KPIs comparativos y barra de acciones |
| 5 | Simulación historial | `05-simulacion-historial.png` | Pestaña Historial |
| 6 | Analítica | `06-analitica-contexto-simulacion.png` | Banner `simulationId` |
| 7 | Reportes | `07-reportes-exportacion.png` | KPIs y botón descarga |
| 8 | Optimización | `08-planificacion-operativa-banner.png` | Banner hacia Simulación + despacho |
| 9 | Mapa | `09-mapa-ruta-optimizada.png` | Capa ruta optimizada |
| 10 | Terminal | `10-defense-verify-ok.png` | Salida `just defense-verify` en verde |

### Cómo generar

```bash
just setup && just migrate && just seed
just defense-verify   # captura 10
# Navegador: recorrer flujo del guion-demo-defensa.md y capturar 1–9
```

---

## 3. Verificación técnica (evidencia reproducible)

```bash
just defense-verify
```

**Última ejecución documentada:** 2026-08-08 — 7/7 pasos OK (dev).

Pasos verificados:
1. Health API + frontend  
2. Login planificador  
3. Datos GIS (sectores, contenedores)  
4. POST `/api/v1/simulations/optimize`  
5. Rutas optimizadas, dashboard, reportes  
6. GET `/api/v1/simulations/{id}`  
7. Nginx (solo prod)

---

## 4. Referencia por fases de implementación

| Fase | Entregable | Documento |
|------|------------|-----------|
| 0 | Alineación Opción A | [fase-0/README.md](../fase-0/README.md) |
| 1 | Navegación y CTAs | [fase-1/README.md](../fase-1/README.md) |
| 2 | Wizard 3 pasos | [fase-2/README.md](../fase-2/README.md) |
| 3 | Variables honestas | [fase-3/README.md](../fase-3/README.md) |
| 4 | Post-simulación | [fase-4/README.md](../fase-4/README.md) |
| 5 | Delimitación módulos | [fase-5/README.md](../fase-5/README.md) |
| 6 | Demo y validación | [fase-6/README.md](./README.md) |
