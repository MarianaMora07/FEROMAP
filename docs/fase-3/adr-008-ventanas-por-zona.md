# ADR-008: Ventanas horarias por zona (consecuencia de ADR-006 para F8)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado · **implementado (F8, 2026-09-11)** |
| **Fecha** | 2026-09-11 |
| **Relación** | [adr-006-ventanas-horarias.md](./adr-006-ventanas-horarias.md) · F8 (multi-zona) |

## Contexto

[ADR-006](./adr-006-ventanas-horarias.md) documentó el soporte de ventanas como **VRPTW light**
opt-in, pero `route_constraints.sector_time_window_secs` las asigna por **paridad de sector**
(pares → mañana, impares → tarde). Es un *placeholder* sintético, no una ventana operativa real.

F8 (escala multi-zona) introduce configuración por parroquia/zona: `depot`, vertedero y
ventanas propias. Si F8 no parametriza las ventanas por zona, el "VRPTW light" seguiría siendo
arbitrario y no sobreviviría a una segunda zona.

## Decisión

Cuando entre F8, las ventanas se **parametrizan por zona**:

1. La configuración por zona (parroquia/zona) define su ventana horaria, o la ausencia de ella.
2. `route_constraints` deja de usar la paridad y **lee la configuración de la zona**.
3. El soporte sigue siendo **opt-in** (`timeWindowEnabled`) y **desactivado por defecto**; el ACO
   sigue minimizando **distancia**.
4. Hasta que F8 se implemente, el comportamiento por paridad **se mantiene** y queda documentado
   como experimental en [limites-solver.md](./limites-solver.md).

## Consecuencias

- F8 amplía su alcance: esquema de configuración por zona + lectura en `route_constraints` +
  tests de determinismo por zona (hoy `test_route_constraints.py` fija la paridad).
- Si en F0/F8 se decidiera retirar las ventanas, este ADR queda sin efecto; no se elimina código
  probado por defecto.
- No cambia la narrativa de defensa: el sistema sigue siendo un **CVRP**.

## Alternativas consideradas

- **Mantener la paridad** (rechazada para multi-zona real; aceptable solo como placeholder temporal).
- **Eliminar las ventanas** (rechazada en ADR-006: el código está integrado y probado).

## Referencias

- `backend/app/services/route_constraints.py` — `sector_time_window_secs` (paridad actual)
- `backend/app/services/optimization_service.py` — `build_customer_time_windows`
- [adr-006-ventanas-horarias.md](./adr-006-ventanas-horarias.md) — alcance VRPTW light
- [limites-solver.md](./limites-solver.md) — límites del solver

## Implementación (F8)

Materializada en F8 sin cambiar el comportamiento por defecto (ventanas opt-in, off):

1. La configuración vive en la **parroquia** (`parishes.depot_lat/lon`, `landfill_lat/lon`,
   `time_window_start/end`), migración `031_parish_zone_config`.
2. `zone_config_service.sector_windows` resuelve la ventana por sector desde su parroquia.
   Un sector sin ventana configurada queda **sin restricción** dentro de la jornada.
3. `route_constraints.build_customer_time_windows(..., zone_windows=...)` recibe ese mapa;
   `optimization_service` **siempre** lo pasa cuando las ventanas están habilitadas, así que la
   paridad de sector queda como **respaldo legado** para llamadas sin configuración.
4. `operational_facilities_service.resolve_operational_facilities(db, parish_id=...)` usa el
   depósito/vertedero de la zona si están configurados; si no, hereda la configuración global.
5. UI administrativa en `/admin` (pestaña General) y API `GET /api/v1/parishes` ·
   `PATCH /api/v1/parishes/{id}/zone`.

Tests: `test_zone_window.py`, `test_zone_config_service.py`, y ampliaciones en
`test_route_constraints.py` y `test_operational_facilities_service.py`.
