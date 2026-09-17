# Evidencia ACO — Fase 3 (rigor algorítmico)

> Generado automáticamente. Regenerar: `just phase3-report`

## Perfiles de benchmark (5 escenarios × 3 perfiles)

_Sin benchmark. Ejecuta `just benchmark-aco`._

## Sensibilidad de parámetros (escenario normal)

**Generado:** 2026-09-17T15:29:10.773909+00:00 · **Duración:** 315.4 s · **Semilla:** 42

KPI de referencia: **distancia optimizada** (D2). El resto de columnas son guardarraíles.

### Hormigas e iteraciones

| Configuración | Hormigas | Iteraciones | CPU (s) | Distancia (km) | Iter. ejecutadas |
|---------------|----------|-------------|---------|----------------|------------------|
| 8 hormigas | 8 | 20 | 3.14 | 190.8 | 10 |
| 12 hormigas (estándar) | 12 | 20 | 3.29 | 190.8 | 9 |
| 20 hormigas | 20 | 20 | 3.25 | 194.2 | 6 |
| 10 iteraciones | 12 | 10 | 3.23 | 190.8 | 9 |
| 20 iteraciones (estándar) | 12 | 20 | 3.21 | 190.8 | 9 |
| 40 iteraciones | 12 | 40 | 3.26 | 190.8 | 9 |

**Trade-off distancia vs tiempo:**
- Mejor distancia: 8 hormigas → 190.8 km (3.14 s)
- Más rápido: 8 hormigas → 190.8 km (3.14 s)

El perfil **12 hormigas × 20 iteraciones** queda en el punto medio operativo entre calidad de solución y costo computacional.

### Hiperparámetros ACO (α, β, ρ, Q)

| Configuración | α | β | ρ | Q | CPU (s) | Distancia (km) | Iter. ejecutadas |
|---------------|---|---|---|---|---------|----------------|------------------|
| α 0.5 | 0.5 | — | — | — | 2.82 | 200.2 | 6 |
| α 1 (estándar) | 1 | — | — | — | 3.22 | 190.8 | 9 |
| α 2 | 2 | — | — | — | 3.57 | 190.2 | 12 |
| β 1 | — | 1 | — | — | 3.2 | 237.6 | 8 |
| β 3 (estándar) | — | 3 | — | — | 3.22 | 190.8 | 9 |
| β 5 | — | 5 | — | — | 4.65 | 184.7 | 19 |
| ρ 0.05 | — | — | 0.05 | — | 3.21 | 190.8 | 9 |
| ρ 0.12 (estándar) | — | — | 0.12 | — | 3.16 | 190.8 | 9 |
| ρ 0.30 | — | — | 0.3 | — | 3.77 | 187.9 | 13 |
| Q 0.5 | — | — | — | 0.5 | 3.36 | 190.8 | 9 |
| Q 1 (estándar) | — | — | — | 1 | 3.26 | 190.8 | 9 |
| Q 2 | — | — | — | 2 | 3.28 | 190.8 | 9 |

**Mejor configuración (distancia):** β 5 → 184.7 km (4.65 s).
Valores estándar evaluados: acoAlpha=1, acoBeta=3, acoRho=0.12, pheromoneQ=1.

## Perfiles de referencia

| ID | Etiqueta | Hormigas | Iteraciones |
|----|----------|----------|-------------|
| `fast` | Rápido | 6 | 10 |
| `standard` | Estándar | 12 | 20 |
| `precise` | Preciso | 20 | 40 |
