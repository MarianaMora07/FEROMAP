import { AlertTriangle } from 'lucide-solid';
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import type { WeeklyPlanDay } from '../../core/api/planning';
import type { PlanningCollectionPointRef } from '../../core/api/collectionPoints';
import type { ScenarioId } from '../../data/types/simulation';
import {
  findWeeklyPlanMissingFromSchedules,
  formatWeekdayLabel,
  weeklyPlanDayLoadLevel,
  weeklyPlanLoadCardClass,
  type WeeklyPlanLoadLevel,
} from '../../core/planning/weeklyPlanCalendar';
import { getCollectionPointRef, weeklyPlanState } from '../../core/stores/weeklyPlanStore';
import { Button, Drawer, SelectField, TextField } from '../../design-system/components';

interface WeeklyPlanWeekCalendarProps {
  days: WeeklyPlanDay[];
  editable: boolean;
  selectedWeekday?: number | null;
  onSelectDay: (weekday: number) => void;
}

export function WeeklyPlanWeekCalendar(props: WeeklyPlanWeekCalendarProps) {
  const maxCount = createMemo(() => Math.max(0, ...props.days.map((day) => day.collectionPointIds.length)));

  const loadLevel = (count: number): WeeklyPlanLoadLevel =>
    weeklyPlanDayLoadLevel(count, maxCount());

  return (
    <div class="space-y-2" data-testid="weekly-plan-week-calendar">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-text-primary dark:text-white">Calendario semanal</p>
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span class="inline-flex items-center gap-1">
            <span class="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Pocos
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="h-2.5 w-2.5 rounded-full bg-amber-300" /> Medio
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="h-2.5 w-2.5 rounded-full bg-orange-400" /> Muchos
          </span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <For each={props.days}>
          {(day) => {
            const level = () => loadLevel(day.collectionPointIds.length);
            const isSelected = () => props.selectedWeekday === day.weekday;
            const isWorkday = () => day.weekday <= 4;

            return (
              <button
                type="button"
                data-testid={`weekly-plan-day-card-${day.weekday}`}
                disabled={!props.editable && day.collectionPointIds.length === 0}
                onClick={() => props.onSelectDay(day.weekday)}
                class={`rounded-xl border p-3 text-left transition-all ${weeklyPlanLoadCardClass[level()]} ${
                  isSelected() ? 'ring-2 ring-fero-green-dark' : 'hover:shadow-sm'
                } ${props.editable ? 'cursor-pointer' : ''}`}
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-semibold">{formatWeekdayLabel(day.weekday)}</p>
                  <Show when={isWorkday()}>
                    <span class="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium dark:bg-dark-surface/70">
                      Laboral
                    </span>
                  </Show>
                </div>
                <p class="mt-1 text-xs opacity-80">{day.operationDate}</p>
                <p class="mt-3 text-2xl font-bold">{day.collectionPointIds.length}</p>
                <p class="text-xs opacity-80">puntos</p>
                <Show when={day.expectedVehicleCount != null}>
                  <p class="mt-2 text-[11px] opacity-80">Flota {day.expectedVehicleCount}</p>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

interface WeeklyPlanMissingPointsAlertProps {
  days: WeeklyPlanDay[];
}

export function WeeklyPlanMissingPointsAlert(props: WeeklyPlanMissingPointsAlertProps) {
  const missing = createMemo(() =>
    findWeeklyPlanMissingFromSchedules(props.days, weeklyPlanState.visitSchedules),
  );

  return (
    <Show when={missing().length > 0}>
      <div
        class="rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25"
        data-testid="weekly-plan-missing-points-alert"
      >
        <div class="flex items-start gap-2">
          <AlertTriangle size={18} class="mt-0.5 shrink-0 text-amber-700 dark:text-amber-200" />
          <div>
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {missing().length} punto(s) con frecuencia semanal sin asignar
            </p>
            <p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
              {missing()
                .slice(0, 6)
                .map((point) => {
                  const sector = getCollectionPointRef(point.collectionPointId)?.sectorName;
                  return sector ? `${point.pointCode} (${sector})` : point.pointCode;
                })
                .join(' · ')}
              <Show when={missing().length > 6}> · …</Show>
            </p>
          </div>
        </div>
      </div>
    </Show>
  );
}

interface WeeklyPlanDayEditorDrawerProps {
  open: boolean;
  day: WeeklyPlanDay | null;
  editable: boolean;
  catalog: PlanningCollectionPointRef[];
  scenarios: Array<{ id: ScenarioId; label: string }>;
  onClose: () => void;
  onApply: (patch: Partial<WeeklyPlanDay>) => void;
}

export function WeeklyPlanDayEditorDrawer(props: WeeklyPlanDayEditorDrawerProps) {
  const [search, setSearch] = createSignal('');
  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);
  const [expectedVehicleCount, setExpectedVehicleCount] = createSignal('');
  const [scenarioOverride, setScenarioOverride] = createSignal('');

  const syncFromDay = () => {
    const day = props.day;
    if (!day) return;
    setSelectedIds([...day.collectionPointIds]);
    setExpectedVehicleCount(day.expectedVehicleCount != null ? String(day.expectedVehicleCount) : '');
    setScenarioOverride(day.scenarioIdOverride ?? '');
    setSearch('');
  };

  createEffect(() => {
    if (props.open && props.day) {
      syncFromDay();
    }
  });

  const filteredCatalog = createMemo(() => {
    const query = search().trim().toLowerCase();
    if (!query) return props.catalog;
    return props.catalog.filter(
      (point) =>
        point.code.toLowerCase().includes(query) ||
        (point.sectorName ?? '').toLowerCase().includes(query),
    );
  });

  const assignedPoints = createMemo(() =>
    selectedIds()
      .map((id) => {
        const ref = props.catalog.find((point) => point.id === id) ?? getCollectionPointRef(id);
        return ref ? { id, code: ref.code, sectorName: ref.sectorName } : null;
      })
      .filter((row): row is { id: number; code: string; sectorName?: string | null } => row != null),
  );

  const togglePoint = (pointId: number) => {
    setSelectedIds((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId],
    );
  };

  const handleApply = () => {
    const fleet = expectedVehicleCount().trim();
    props.onApply({
      collectionPointIds: selectedIds(),
      expectedVehicleCount: fleet ? Number(fleet) : null,
      scenarioIdOverride: scenarioOverride() || null,
    });
    props.onClose();
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={
        props.day
          ? `${formatWeekdayLabel(props.day.weekday)} · ${props.day.operationDate}`
          : 'Editar día'
      }
    >
      <Show when={props.day}>
        {(day) => (
          <div class="space-y-5" data-testid="weekly-plan-day-editor">
            <div>
              <p class="text-sm font-semibold text-text-primary dark:text-white">Puntos asignados</p>
              <Show
                when={assignedPoints().length > 0}
                fallback={<p class="mt-2 text-sm text-text-muted">Sin puntos en este día.</p>}
              >
                <ul class="mt-2 space-y-2">
                  <For each={assignedPoints()}>
                    {(point) => (
                      <li class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 dark:border-dark-border">
                        <div>
                          <p class="text-sm font-medium text-text-primary dark:text-white">{point.code}</p>
                          <p class="text-xs text-text-muted">{point.sectorName ?? 'Sin sector'}</p>
                        </div>
                        <Show when={props.editable}>
                          <Button size="sm" variant="outline" onClick={() => togglePoint(point.id)}>
                            Quitar
                          </Button>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>

            <Show when={props.editable}>
              <div class="space-y-3">
                <TextField
                  label="Buscar en catálogo"
                  value={search()}
                  placeholder="Código o sector"
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
                <div class="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-2 dark:border-dark-border">
                  <For each={filteredCatalog()}>
                    {(point) => (
                      <label class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface/70 dark:hover:bg-dark-surface-hover">
                        <input
                          type="checkbox"
                          class="mt-1"
                          checked={selectedIds().includes(point.id)}
                          onChange={() => togglePoint(point.id)}
                        />
                        <span>
                          <span class="block text-sm font-medium text-text-primary dark:text-white">
                            {point.code}
                          </span>
                          <span class="block text-xs text-text-muted">{point.sectorName ?? 'Sin sector'}</span>
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Flota esperada (opcional)"
                  type="number"
                  min="1"
                  value={expectedVehicleCount()}
                  onInput={(e) => setExpectedVehicleCount(e.currentTarget.value)}
                />
                <SelectField
                  label="Escenario del día (opcional)"
                  value={scenarioOverride()}
                  onChange={(e) => setScenarioOverride(e.currentTarget.value)}
                >
                  <option value="">Usar condición de la semana</option>
                  <For each={props.scenarios}>{(row) => <option value={row.id}>{row.label}</option>}</For>
                </SelectField>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleApply}>
                  Aplicar cambios
                </Button>
                <Button variant="outline" onClick={props.onClose}>
                  Cancelar
                </Button>
              </div>
            </Show>

            <Show when={!props.editable}>
              <p class="text-sm text-text-secondary">Este plan no es editable.</p>
            </Show>
          </div>
        )}
      </Show>
    </Drawer>
  );
}
