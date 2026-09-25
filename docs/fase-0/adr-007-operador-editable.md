# ADR-007: Confirmación de paradas por el conductor (operador editable)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado |
| **Fecha** | 2026-09-11 |
| **Fase** | F5b (posterior a F5a) |
| **Relación** | [adr-001-simulacion-principal.md](./adr-001-simulacion-principal.md) · `src/features/operator/OperatorDailyPlanPage.tsx` |

## Contexto

Hoy el operador es **de solo lectura por decisión explícita**: la vista `/operator` declara
«No hay acciones de despacho ni cierre de día disponibles para conductores… Los cambios los
realiza planificación». El despacho y el cierre de jornada son de planificación (ADR-001).

Sin embargo, el cierre del ciclo previsto vs. real (F5a) se alimenta de
`route_waypoints.actual_arrival_at` y `collected_weight_kg`, campos que **hoy no escribe el
conductor**: los llena un avance disparado por planificación o por la acción de demo
(`advance_route` / `advance_active_routes`, esta última ya marcada demo-only en F5a). Eso
obliga a *inferir* la ejecución en vez de capturarla en campo.

## Decisión

Se aprueba **una confirmación de parada de alcance limitado**, como fase **F5b**:

1. El conductor puede marcar una parada como **visitada** u **omitida**, con nota opcional.
2. **No** puede despachar rutas ni cerrar el día; esa autoridad sigue siendo de planificación.
3. Queda detrás de un feature flag `OPERATOR_STOP_CONFIRMATION_ENABLED`, **desactivado por
   defecto**, para no alterar el flujo congelado ni la demo si no se desea.
4. **Auditoría por parada**: al confirmar se escriben `actual_arrival_at` y
   `collected_weight_kg` (si aplica) y se registra **quién** confirmó y **cuándo**
   (`confirmed_by_user_id`, `confirmation_source`), más una entrada de historial.
5. Solo el **conductor asignado** a la ruta (o un administrador) puede confirmar.
6. Reutiliza la **idempotencia** de F4 para que un reintento del conductor no duplique el efecto.

## Consecuencias

- F5b incluye: permiso/rol, endpoint explícito y auditado (p. ej.
  `POST /routes/{id}/confirm-stop`), UI en `/operator`, auditoría y tests (incluye doble POST).
- El contrato de `plan_vs_real_from_routes` (F5a) **no cambia**: ya lee esos campos. Matiz
  (2026-09-26): `collectedKg` solo suma el peso de las paradas **servidas** — el motor pre-carga
  `collected_weight_kg` con la demanda planificada, y contarla sin filtrar mostraba toneladas
  «recolectadas» en días sin ninguna parada confirmada.
- Fuera de alcance: despacho, cierre de jornada y edición de secuencia de paradas.
- **No** forma parte del alcance congelado de defensa salvo que se active el flag.

## Alternativas consideradas

- **Mantener solo lectura** (rechazada): se pierde el dato real de campo y el cierre depende de inferencias.
- **Operador totalmente editable** (rechazada): contradice ADR-001 y el principio «planificación despacha».
- **Confirmación offline/PWA** (diferida): se evalúa junto con F8; no es requisito de la primera versión.

## Referencias

- `src/features/operator/OperatorDailyPlanPage.tsx` — declaración de solo lectura actual
- `backend/app/services/operations_service.py` — `advance_route` (escritura actual de los campos)
- `backend/app/domain/plan_kpis.py` — `plan_vs_real_from_routes` (consumidor)
- [adr-001-simulacion-principal.md](./adr-001-simulacion-principal.md) — simulación principal; planificación operativa
