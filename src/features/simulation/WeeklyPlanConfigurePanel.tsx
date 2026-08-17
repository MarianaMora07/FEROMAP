import { For, Show, createMemo, createSignal } from 'solid-js';
import { Button, SelectField } from '../../design-system/components';
import { mergeWeekCalendarDays } from '../../core/planning/weeklyPlanCalendar';
import type { WeeklyPlan } from '../../core/api/planning';
import type { ScenarioId } from '../../data/types/simulation';
import { updateWeeklyPlanDay, weeklyPlanState } from '../../core/stores/weeklyPlanStore';
import {
  WeeklyPlanDayEditorDrawer,
  WeeklyPlanMissingPointsAlert,
  WeeklyPlanWeekCalendar,
} from './WeeklyPlanConfigureStep';

interface WeeklyPlanConfigurePanelProps {
  plan: WeeklyPlan;
  editable: boolean;
  scenarios: Array<{ id: ScenarioId; label: string }>;
  onScenarioChange: (scenarioId: ScenarioId) => void;
  onAutofill: () => void;
  onSaveDraft: () => void;
}

export function WeeklyPlanConfigurePanel(props: WeeklyPlanConfigurePanelProps) {
  const [selectedWeekday, setSelectedWeekday] = createSignal<number | null>(null);
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  const calendarDays = createMemo(() => mergeWeekCalendarDays(props.plan.weekStartDate, props.plan.days ?? []));
  const selectedDay = createMemo(() => calendarDays().find((day) => day.weekday === selectedWeekday()) ?? null);

  const openDay = (weekday: number) => {
    setSelectedWeekday(weekday);
    setDrawerOpen(true);
  };

  return (
    <div class="space-y-4" data-testid="weekly-plan-step-1">
      <div>
        <SelectField
          label="Condición de la semana"
          value={props.plan.scenarioId ?? 'normal'}
          disabled={!props.editable}
          onChange={(e) => props.onScenarioChange(e.currentTarget.value as ScenarioId)}
        >
          <For each={props.scenarios}>{(row) => <option value={row.id}>{row.label}</option>}</For>
        </SelectField>
        <p class="mt-1 text-xs text-text-muted">Se usa al validar y al abrir cada día en operación.</p>
      </div>

      <WeeklyPlanMissingPointsAlert days={calendarDays()} />

      <WeeklyPlanWeekCalendar
        days={calendarDays()}
        editable={props.editable}
        selectedWeekday={selectedWeekday()}
        onSelectDay={openDay}
      />

      <WeeklyPlanDayEditorDrawer
        open={drawerOpen()}
        day={selectedDay()}
        editable={props.editable}
        catalog={weeklyPlanState.collectionPoints}
        scenarios={props.scenarios}
        onClose={() => setDrawerOpen(false)}
        onApply={(patch) => {
          const weekday = selectedWeekday();
          if (weekday == null) return;
          updateWeeklyPlanDay(weekday, patch);
        }}
      />

      <Show when={props.editable}>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={weeklyPlanState.isSaving}
            onClick={() => props.onAutofill()}
            data-testid="weekly-plan-primary-cta"
          >
            Autocompletar desde frecuencias
          </Button>
          <Button variant="outline" loading={weeklyPlanState.isSaving} onClick={() => props.onSaveDraft()}>
            Guardar borrador
          </Button>
        </div>
      </Show>
    </div>
  );
}
