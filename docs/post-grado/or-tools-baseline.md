# Backlog 1 — OR-Tools como baseline exacto

**Estado:** backlog  
**Esfuerzo:** 8–15 días  
**Prioridad post-grado:** alta (refuerzo académico)

## Objetivo

Comparar la solución ACO de FEROMAP contra un **solver exacto o near-exact** (Google OR-Tools CP-SAT / routing) en **instancias pequeñas** (≤15 contenedores, 2–4 vehículos), para cuantificar el gap de optimalidad de la heurística.

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| Integración pesada | Nueva dependencia (`ortools`), modelado CVRP distinto al ACO actual |
| Riesgo pre-defensa | Cambios en `optimization_service` pueden romper demo y `defense-verify` |
| Tiempo de cómputo | Instancias grandes son intratables; hay que acotar el benchmark |
| Narrativa tesis | La defensa ya argumenta heurística + evidencia empíica (Fase 3), no optimalidad |

## Alcance propuesto

### Incluido

- Script `backend/scripts/ortools_baseline.py` para N ≤ 15 puntos
- Misma matriz de distancias que el motor ACO (reutilizar caché)
- Tabla: instancia, distancia OR-Tools, distancia ACO, gap %, tiempo CPU
- Documento en `docs/post-grado/evidencia-ortools.md` (auto-generado)

### Excluido

- OR-Tools en ruta crítica de producción
- Multi-trip vertedero en CP-SAT (fase 2 del ítem, si se retoma)
- VRPTW completo en OR-Tools

## Diseño técnico (borrador)

```
Matriz distancia (existente)
        ↓
   OR-Tools RoutingModel (capacidad, depot, opcional time dimension light)
        ↓
   Comparar con resultado ACO persistido o corrida fresh
        ↓
   JSON caché + markdown reporte
```

## Dependencias

- `ortools` en `requirements.txt` (grupo opcional `requirements-ortools.txt`)
- Instancias de prueba en `data/benchmarks/small-instances/`

## Criterios de aceptación

- [ ] Gap documentado en ≥5 instancias reales de Unare (subconjuntos)
- [ ] Tiempo OR-Tools < 60 s por instancia pequeña en hardware de referencia
- [ ] No modifica el fitness ni el flujo operativo del ACO en producción
- [ ] Test: `test_ortools_baseline_small_instance.py` con instancia sintética 5 nodos

## Narrativa para publicación

> «En instancias acotadas, el ACO de FEROMAP se encuentra a X% de la mejor solución conocida por OR-Tools, con un speedup de Y× en tiempo de cómputo.»

## Referencias

- Motor actual: `backend/app/services/optimization_service.py`
- Benchmark ACO: `backend/app/services/benchmark_service.py`
- Exclusión defensa: `docs/fase-0/alineacion-defensa.md` §2
