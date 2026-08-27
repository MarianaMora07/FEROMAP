# Fase 3 — Rigor algorítmico (tesis)

**Estado:** completado  
**Fecha:** 2026-08-27

Documentación y evidencia experimental para fortalecer el capítulo de implementación y resultados.

## Entregables

| ID | Entregable | Ubicación |
|----|------------|-----------|
| 3.1 | Límites del solver | [limites-solver.md](./limites-solver.md) |
| 3.1 | Matriz UI ↔ motor (actualizada) | [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md) |
| 3.2 | Benchmark 5×3 perfiles | [evidencia-aco.md](./evidencia-aco.md) |
| 3.3 | Sensibilidad ACO (6 corridas) | [evidencia-aco.md](./evidencia-aco.md) + UI en `/optimization` |
| 3.4 | Acciones sobre puntos no cubiertos | `UncoveredPointsActionsPanel` + API `defer-uncovered` |
| 3.5 | Regresión pre-defensa | `just defense-verify` ampliado |

## Comandos reproducibles

```bash
# Benchmark completo (5 escenarios × 3 perfiles: rápido, estándar, exhaustivo)
just benchmark-aco

# Sensibilidad (hormigas 8/12/20 e iteraciones 10/20/40, escenario normal)
just phase3-sensitivity

# Reporte markdown para capítulo/memo
just phase3-report

# Verificación pre-defensa (optimize → KPIs → playback → dispatch)
just defense-verify
```

## Justificación del perfil estándar 12×20

El perfil **estándar** (12 hormigas × 20 iteraciones) se eligió porque:

1. **Benchmark:** CPU aceptable en los 5 escenarios operativos vs perfil preciso (20×40).
2. **Sensibilidad:** punto medio entre calidad de distancia y tiempo de cómputo.
3. **Early stop:** el motor puede detenerse antes por criterio de paciencia (`acoPatience`).
4. **Demo en vivo:** ~8–12 s por corrida con grafo en caché (entorno dev).

Ver tablas numéricas en [evidencia-aco.md](./evidencia-aco.md).

## Fase 3 anterior (honestidad de variables)

La fase 3 original (2026-08-08) cubrió honestidad de variables UI. Ver decisiones en el [README histórico](./README-variables.md) si aplica.

## Archivos clave

- `backend/app/services/benchmark_service.py`
- `backend/app/services/aco_sensitivity_service.py`
- `backend/scripts/generate_phase3_report.py`
- `src/features/optimization/OptimizationAcoSensitivityPanel.tsx`
- `src/features/landfill/UncoveredPointsActionsPanel.tsx`
- `scripts/defense-verify.sh`
