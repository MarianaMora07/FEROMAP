# Configuración por zona (parroquias)

Documenta la configuración operativa por zona introducida en F8 (multi-zona):
depósito, vertedero y ventana horaria propios de cada parroquia.

## Dónde se configura

- **UI:** `/admin` → pestaña **General** → panel **Zonas (parroquias)**.
- **API:**
  - `GET /api/v1/parishes` — lista las zonas (cualquier usuario autenticado).
  - `PATCH /api/v1/parishes/{id}/zone` — ajuste parcial (planner/admin).

Campos (todos opcionales):

| Campo | Significado | Vacío / `null` |
|---|---|---|
| `depotLat`, `depotLon` | Depósito de la zona | Hereda la configuración global |
| `landfillLat`, `landfillLon` | Vertedero de la zona | Hereda la configuración global |
| `timeWindowStart`, `timeWindowEnd` | Ventana de recolección `HH:MM` | Sin ventana (sin restricción horaria) |

## Semántica

- La **zona** es la **parroquia** (`parishes`); sus sectores heredan la configuración.
- **Depósito/vertedero:** si la zona define ambos valores, el motor los usa; si falta
  alguno, se hereda el valor global de la configuración operativa (Administración →
  General, sección de instalaciones).
- **Ventana horaria:** debe caer dentro de la jornada `06:00–18:00` y con inicio
  anterior al fin; el API rechaza (`400`) una ventana incompleta o inválida. Sigue
  siendo **opt-in**: solo aplica si el toggle de ventanas está activo en la optimización.
- **Multi-parroquia:** si una corrida incluye sectores de **varias** parroquias, no se
  aplica override de instalaciones (se usa el global); las ventanas sí son por sector,
  así que cada contenedor respeta la de su zona.

## Validaciones y errores

| Caso | Respuesta |
|---|---|
| `timeWindowStart` definido sin `timeWindowEnd` (o al revés) | `400` — ventana incompleta |
| Inicio ≥ fin | `400` — ventana inválida |
| Ventana fuera de `06:00–18:00` | `400` — ventana inválida |
| `PATCH` sobre una zona inexistente | `404` |

## Migración y datos

- Migración: `031_parish_zone_config`.
- Los campos nacen **vacíos**: ninguna parroquia cambia de comportamiento hasta que
  se configure explícitamente.

## Relación con decisiones

- [ADR-008](../fase-3/adr-008-ventanas-por-zona.md) — ventanas por zona (implementado).
- [ADR-006](../fase-3/adr-006-ventanas-horarias.md) — alcance "VRPTW light".
- [ADR-004](../fase-9/adr-vertedero-multi-viaje.md) — vertedero multi-viaje.
