import { For, Show, createMemo, createSignal } from 'solid-js';
import { Button, SelectField } from '../../../design-system/components';
import { mergeWeekCalendarDays } from '../../../core/planning/weeklyPlanCalendar';
import type { WeeklyPlan } from '../../../core/api/planning';
import type { ScenarioId } from '../../../data/types/simulation';
import { applyWeeklyCaseStudy, updateWeeklyPlanDay, updateWeeklyPlanFleet, weeklyPlanState } from '../../../core/stores/weeklyPlanStore';
import { CaseStudySelector } from '../../case-studies/CaseStudySelector';
import { WeeklyPlanFleetEditor } from './WeeklyPlanFleetEditor';
import {
  WeeklyPlanDayEditorDrawer,
  WeeklyPlanMissingPointsAlert,
  WeeklyPlanValidationTable,
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
  const caseStudyLinked = () => Boolean(props.plan.caseStudyId);

  const openDay = (weekday: number) => {
    setSelectedWeekday(weekday);
    setDrawerOpen(true);
  };

  return (
    <div class="space-y-4" data-testid="weekly-plan-step-1">
      <CaseStudySelector
        context="operational"
        value={weeklyPlanState.draftCaseStudy}
        disabled={!props.editable}
        onChange={(detail) => {
          void applyWeeklyCaseStudy(detail);
        }}
      />
      <Show when={caseStudyLinked()}>
        <p class="text-xs text-text-muted">
          Los días laborables heredan los puntos activos del caso
          {props.plan.caseStudyCode ? ` ${props.plan.caseStudyCode}` : ''}. Los overrides del caso se aplican al
          validar y al optimizar cada día.
        </p>
      </Show>

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

      <WeeklyPlanFleetEditor
        value={props.plan.fleetByType}
        editable={props.editable}
        onChange={(fleet) => updateWeeklyPlanFleet(fleet)}
      />

      <Show when={!caseStudyLinked()}>
        <WeeklyPlanMissingPointsAlert days={calendarDays()} />
      </Show>

      <WeeklyPlanWeekCalendar
        days={calendarDays()}
        editable={props.editable}
        selectedWeekday={selectedWeekday()}
        onSelectDay={openDay}
      />

      <WeeklyPlanValidationTable plan={props.plan} />

      <WeeklyPlanDayEditorDrawer
        open={drawerOpen()}
        day={selectedDay()}
        editable={props.editable}
        caseStudyLinked={caseStudyLinked()}
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
            {caseStudyLinked() ? 'Aplicar puntos del caso' : 'Autocompletar desde frecuencias'}
          </Button>
          <Button variant="outline" loading={weeklyPlanState.isSaving} onClick={() => props.onSaveDraft()}>
            Guardar borrador
          </Button>
        </div>
      </Show>
    </div>
  );
}
