# ADR-006: Alcance de las ventanas horarias (VRPTW light)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado |
| **Fecha** | 2026-09-11 |
| **Relación** | Resuelve la contradicción entre [fase-4/README.md](../fase-4/README.md) y [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md) (ventanas conectadas) frente a [alineacion-defensa.md](../fase-0/alineacion-defensa.md) y [limites-solver.md](./limites-solver.md) (ventanas excluidas) |

## Contexto

El motor ACO expone una restricción **opt-in** de ventanas horarias:

- `OptimizationParametersForm.tsx` renderiza el toggle **Ventana de tiempo** y lo envía como
  `timeWindowEnabled` ([optimization.ts](../../src/core/api/optimization.ts));
- el preset por defecto lo deja en `false`;
- `optimization_service.py` construye las ventanas con `build_customer_time_windows(...)` y
  `aco_parallel.build_ant_solution` valida cada visita con `is_visit_feasible_with_window`;
- `route_constraints.sector_time_window_secs` asigna **ventanas amplias por paridad de sector**:
  sectores pares → mañana (06:00–12:00), impares → tarde (12:00–18:00);
- existen tests dedicados (`test_route_constraints.py`, `test_aco_route_constraints.py`).

No son ventanas operativas reales por contenedor ni por sector configurables: son bandas amplias
derivadas de la paridad del sector.

La documentación estaba partida en dos narrativas:

| Documento | Lo que decía | ¿Coincide con el código? |
|-----------|--------------|--------------------------|
| `fase-4/README.md` | "Ventanas horarias simplificadas (`time_window`) — **Conectada**" | Sí |
| `matriz-variables-motor.md` | "Toggle UI → ventanas mañana/tarde por sector — **Conectada** — VRPTW light" | Sí |
| `fase-0/alineacion-defensa.md` | "VRPTW — Toggle en UI deshabilitado; sin lógica en el solver" | No |
| `fase-3/limites-solver.md` | "VRPTW — Sin ventanas horarias por contenedor o sector" | No |
| `fase-3/README-variables.md` | "`fill_level` / `time_window` — Próximamente; deshabilitadas en UI" | No |

## Decisión

Se documenta el soporte como **feature real y opt-in "VRPTW light"**, alineado con lo que ya
registraban la Fase 4 y la matriz de variables:

1. **Naturaleza:** ventanas amplias por sector (mañana/tarde por paridad), no ventanas operativas
   reales por contenedor.
2. **Activación:** opt-in vía `timeWindowEnabled`; **desactivado por defecto**.
3. **Efecto:** restringe la construcción de ruta del ant; no cambia la función objetivo
   (el ACO sigue minimizando **distancia**).
4. **Alcance académico:** el sistema sigue siendo un **CVRP**. "VRPTW light" es una capacidad
   adicional acotada, **no** un VRPTW completo.

## Alternativas consideradas

- **(b) Apagar por defecto y retirar el toggle.** Rechazada: el toggle ya está integrado y probado,
  y la Fase 4 y la matriz de variables lo documentan como entregado. Retirar capacidad probada
  aportaría menos que corregir las tres fuentes desactualizadas.
- **Promoverlo a VRPTW completo** (ventanas operativas reales por sector/contenedor). Diferida:
  exige modelar ventanas operativas por zona, que hoy no existen en los seeds (ver
  [backlog post-grado](../post-grado/README.md)).

## Consecuencias

- `alineacion-defensa.md`, `limites-solver.md` y `README-variables.md` quedan corregidos para
  citar el mismo estado real del solver.
- La narrativa de defensa sigue siendo CVRP; ante la pregunta "¿tienen ventanas horarias?" la
  respuesta pasa a ser "sí, soporte opt-in acotado (VRPTW light), no ventanas operativas reales".
- **No** se afirma optimalidad ni se equipara a VRPTW completo.

## Actualización (F8)

Desde F8, el **origen** de las ventanas ya no es la paridad de sector: cada parroquia
configura su ventana y `optimization_service` la resuelve por zona (un sector sin ventana
queda sin restricción). La paridad permanece solo como **respaldo legado** en
`sector_time_window_secs` para llamadas sin configuración.
→ [ADR-008](./adr-008-ventanas-por-zona.md) · [zonas.md](../operaciones/zonas.md).

## Referencias

- Motor: `backend/app/services/optimization_service.py`, `backend/app/services/aco_parallel.py`
- Restricciones: `backend/app/services/route_constraints.py`
- API: `POST /api/v1/planning/daily/{id}/optimize` (`timeWindowEnabled`)
- [fase-4/README.md](../fase-4/README.md) — comportamiento de las ventanas
- [adr-008-ventanas-por-zona.md](./adr-008-ventanas-por-zona.md) — parametrización por zona en F8
- [limites-solver.md](./limites-solver.md) — límites del motor ACO
- [alineacion-defensa.md](../fase-0/alineacion-defensa.md) — alcance congelado
