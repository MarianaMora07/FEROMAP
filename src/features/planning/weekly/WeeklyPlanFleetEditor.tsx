import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { fetchVehicles, hasAssignedDriver, isAssignableVehicle } from '../../../core/api/vehicles';
import { Button } from '../../../design-system/components';

export interface WeeklyFleetTypeRow {
  type: string;
  available: number;
}

interface WeeklyPlanFleetEditorProps {
  value: Record<string, number> | null | undefined;
  editable: boolean;
  onChange: (fleet: Record<string, number> | null) => void;
}

/** Tipos conocidos del sistema; se muestran siempre para poder configurar la flota. */
const KNOWN_TYPE_ORDER = ['Compactadora', 'Volteo'];

export function WeeklyPlanFleetEditor(props: WeeklyPlanFleetEditorProps) {
  const [draft, setDraft] = createSignal<Record<string, number>>({});
  const [availability, setAvailability] = createSignal<WeeklyFleetTypeRow[]>([]);
  const [availabilityKnown, setAvailabilityKnown] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);

  const defaultsFromAvailability = () => {
    const resolved: Record<string, number> = {};
    for (const row of availability()) {
      if (row.available > 0) resolved[row.type] = row.available;
    }
    return resolved;
  };

  const syncDraft = (next?: Record<string, number> | null) => {
    const source =
      next === undefined
        ? (props.value ?? defaultsFromAvailability())
        : next === null
          ? defaultsFromAvailability()
          : next;
    const merged: Record<string, number> = {};
    for (const type of KNOWN_TYPE_ORDER) {
      merged[type] = Math.max(0, Math.floor(source[type] ?? 0));
    }
    for (const row of availability()) {
      merged[row.type] = Math.max(0, Math.floor(source[row.type] ?? 0));
    }
    // Tipos configurados fuera del catálogo se conservan visibles.
    for (const [type, count] of Object.entries(source ?? {})) {
      if (merged[type] === undefined && count > 0) {
        merged[type] = Math.max(0, Math.floor(Number(count)));
      }
    }
    setDraft(merged);
  };

  onMount(async () => {
    try {
      const vehicles = await fetchVehicles();
      const byType = new Map<string, number>();
      for (const vehicle of vehicles) {
        if (!isAssignableVehicle(vehicle.status) || !hasAssignedDriver(vehicle)) continue;
        byType.set(vehicle.type, (byType.get(vehicle.type) ?? 0) + 1);
      }
      const rows = Array.from(byType.entries()).map(([type, available]) => ({ type, available }));
      rows.sort((a, b) => {
        const ia = KNOWN_TYPE_ORDER.indexOf(a.type);
        const ib = KNOWN_TYPE_ORDER.indexOf(b.type);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.type.localeCompare(b.type);
      });
      setAvailability(rows);
    } catch {
      setAvailability([]);
    }
    setAvailabilityKnown(true);
    setDirty(false);
  });

  createEffect(() => {
    if (dirty()) return;
    syncDraft(props.value ?? null);
  });

  /** Todas las filas: tipos conocidos + tipos con unidades + configurados por el usuario. */
  const typeRows = createMemo(() => {
    const byType = new Map<string, WeeklyFleetTypeRow>();
    for (const type of KNOWN_TYPE_ORDER) {
      byType.set(type, { type, available: 0 });
    }
    for (const row of availability()) {
      byType.set(row.type, row);
    }
    for (const type of Object.keys(draft())) {
      if (!byType.has(type)) {
        byType.set(type, { type, available: 0 });
      }
    }
    return Array.from(byType.values()).sort((a, b) => {
      const ia = KNOWN_TYPE_ORDER.indexOf(a.type);
      const ib = KNOWN_TYPE_ORDER.indexOf(b.type);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.type.localeCompare(b.type);
    });
  });

  const total = createMemo(() =>
    Object.values(draft()).reduce((sum, count) => sum + Math.max(0, count), 0),
  );

  /**
   * Tope superior por tipo: la cantidad de unidades asignables con conductor del catálogo.
   * Solo se impone cuando la disponibilidad se cargó con datos (si el catálogo falla o viene
   * vacío no se limita, para no bloquear la edición).
   */
  const maxFor = (row: WeeklyFleetTypeRow) =>
    availabilityKnown() && availability().length > 0 ? row.available : Number.POSITIVE_INFINITY;

  const clampCount = (row: WeeklyFleetTypeRow, count: number) => {
    const max = maxFor(row);
    return Math.max(0, Math.min(Math.floor(count), Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER));
  };

  const setCount = (row: WeeklyFleetTypeRow, count: number) => {
    setDirty(true);
    setDraft((current) => ({ ...current, [row.type]: clampCount(row, count) }));
  };

  /** Usar todos los asignables: limpia la restricción (el motor toma el catálogo completo). */
  const useAllDefault = () => {
    setDirty(false);
    setDraft(defaultsFromAvailability());
    props.onChange(null);
  };

  const apply = () => {
    setDirty(false);
    const resolved: Record<string, number> = {};
    for (const [type, count] of Object.entries(draft())) {
      if (count > 0) resolved[type] = count;
    }
    props.onChange(Object.keys(resolved).length > 0 ? resolved : null);
  };

  const rowHint = (row: WeeklyFleetTypeRow) => {
    if (!availabilityKnown()) return 'disponibilidad por confirmar…';
    if (row.available > 0) return `máx. ${row.available} asignables con conductor`;
    return 'sin unidades asignables';
  };

  return (
    <div
      class="rounded-xl border border-border bg-surface/40 p-4 dark:border-dark-border"
      data-testid="weekly-plan-fleet-editor"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-text-primary dark:text-white">
            Flota de la semana — ¿cuántos vehículos por tipo?
          </p>
          <p class="mt-0.5 text-xs text-text-muted">
            Cada día de la semana se optimiza con esta flota. Escribe el número de cada tipo o pulsa
            «Todos (por defecto)» para usar la flota asignable completa.
          </p>
        </div>
        <Show when={total() > 0}>
          <span class="rounded-full bg-fero-green/15 px-2.5 py-1 text-xs font-semibold text-fero-green-dark dark:text-fero-green">
            {total()} vehículos / día
          </span>
        </Show>
      </div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <For each={typeRows()}>
          {(row) => {
            const count = () => draft()[row.type] ?? 0;
            const max = () => maxFor(row);
            const atMax = () => Number.isFinite(max()) && count() >= max();
            const exceeds = () => Number.isFinite(max()) && count() > max();
            return (
              <div class="flex items-center justify-between gap-3 rounded-lg border border-border bg-app/40 px-3 py-2 dark:border-dark-border">
                <div class="min-w-0">
                  <p
                    class="text-sm font-medium text-text-primary dark:text-white"
                    data-testid={`weekly-plan-fleet-type-${row.type}`}
                  >
                    {row.type}
                  </p>
                  <p class="text-[11px] text-text-muted">{rowHint(row)}</p>
                  <Show when={exceeds()}>
                    <p class="text-[11px] font-medium text-amber-700 dark:text-amber-200">
                      Por encima del máximo asignable ({max()}).
                    </p>
                  </Show>
                </div>
                <div class="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Menos ${row.type}`}
                    disabled={!props.editable || count() <= 0}
                    onClick={() => setCount(row, count() - 1)}
                  >
                    −
                  </Button>
                  <input
                    type="number"
                    min="0"
                    max={Number.isFinite(max()) ? max() : 99}
                    value={count()}
                    disabled={!props.editable}
                    aria-label={`Cantidad ${row.type}`}
                    data-testid={`weekly-plan-fleet-input-${row.type}`}
                    onInput={(event) => setCount(row, Number(event.currentTarget.value) || 0)}
                    class="w-14 rounded-md border border-border bg-elevated px-2 py-1 text-center text-sm text-text-primary outline-none focus:border-fero-green dark:border-dark-border dark:bg-dark-surface"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Más ${row.type}`}
                    title={Number.isFinite(max()) ? `Máximo ${max()} disponibles` : undefined}
                    disabled={!props.editable || atMax()}
                    onClick={() => setCount(row, count() + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <Show
        when={props.editable}
        fallback={
          <p class="mt-3 text-xs text-amber-700 dark:text-amber-200">
            Esta semana no es editable (ya está aprobada o archivada). Crea un borrador para una
            semana futura si necesitas cambiar la flota.
          </p>
        }
      >
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            data-testid="weekly-plan-fleet-use-all"
            onClick={useAllDefault}
          >
            Todos (por defecto)
          </Button>
          <Button size="sm" variant="outline" data-testid="weekly-plan-fleet-apply" onClick={apply}>
            Aplicar esta composición
          </Button>
        </div>
        <p class="mt-2 text-[11px] text-text-muted">
          «Todos (por defecto)» usa toda la flota asignable del catálogo (recomendado). Con «Aplicar
          esta composición» fijas la cantidad exacta por tipo. Recuerda pulsar «Guardar borrador» para
          persistir.
        </p>
      </Show>
    </div>
  );
}
