import { For, Show } from 'solid-js';
import {
  Button,
  Card,
  CardHeader,
  SelectField,
  TextField,
} from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import type {
  CalibrationJobStatus,
  CalibrationMethodPhase,
  CalibrationSweep,
} from '../../core/api/benchmark';
import type { Scenario } from '../../data/types/simulation';
import {
  CALIBRATION_METHOD_PHASE_OPTIONS,
  CALIBRATION_MODES,
  controlsDisabled,
  type CalibrationRunConfig,
} from './calibrationRunUx';

interface CalibrationRunControlsProps {
  config: CalibrationRunConfig;
  scenarios: Scenario[];
  status: CalibrationJobStatus | null;
  onChange: (patch: Partial<CalibrationRunConfig>) => void;
  onRun: () => void;
}

/**
 * Controles del barrido: modo, escenario, semilla y reutilización de caché. Se
 * deshabilitan mientras hay un job en curso.
 */
export function CalibrationRunControls(props: CalibrationRunControlsProps) {
  const tr = useLocale();
  const disabled = () => controlsDisabled(props.status);

  return (
    <Card>
      <CardHeader title={tr('calibration.runConfig')} />

      <div class="grid gap-3 sm:grid-cols-3">
        <SelectField
          label={tr('calibration.mode')}
          data-testid="calibration-mode"
          disabled={disabled()}
          value={props.config.mode}
          onChange={(event) =>
            props.onChange({ mode: event.currentTarget.value as CalibrationSweep })
          }
        >
          <For each={CALIBRATION_MODES}>
            {(mode) => <option value={mode.value}>{tr(mode.labelKey)}</option>}
          </For>
        </SelectField>

        <SelectField
          label={tr('calibration.scenario')}
          data-testid="calibration-scenario"
          disabled={disabled()}
          value={props.config.scenarioId}
          onChange={(event) => props.onChange({ scenarioId: event.currentTarget.value })}
        >
          <For each={props.scenarios}>
            {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
          </For>
        </SelectField>

        <TextField
          label={tr('calibration.seed')}
          data-testid="calibration-seed"
          type="number"
          min="0"
          disabled={disabled()}
          value={props.config.seed}
          onChange={(event) => props.onChange({ seed: Number(event.currentTarget.value) })}
        />
      </div>

      <Show when={props.config.mode === 'method'}>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label={tr('calibration.method.phaseLabel')}
            data-testid="calibration-method-phase"
            disabled={disabled()}
            value={props.config.methodPhase}
            onChange={(event) =>
              props.onChange({
                methodPhase: event.currentTarget.value as CalibrationMethodPhase,
              })
            }
          >
            <For each={CALIBRATION_METHOD_PHASE_OPTIONS}>
              {(phase) => <option value={phase.value}>{tr(phase.labelKey)}</option>}
            </For>
          </SelectField>

          <label class="flex items-center gap-2 self-end text-sm text-text-secondary sm:mb-3">
            <input
              type="checkbox"
              data-testid="calibration-method-short"
              class="h-4 w-4 rounded border-border text-fero-blue focus:ring-fero-blue"
              checked={props.config.methodShort}
              disabled={disabled()}
              onChange={(event) => props.onChange({ methodShort: event.currentTarget.checked })}
            />
            {tr('calibration.method.short')}
          </label>
        </div>
      </Show>

      <label class="mt-3 flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          data-testid="calibration-reuse-cache"
          class="h-4 w-4 rounded border-border text-fero-blue focus:ring-fero-blue"
          checked={props.config.reuseCache}
          disabled={disabled()}
          onChange={(event) => props.onChange({ reuseCache: event.currentTarget.checked })}
        />
        {tr('calibration.reuseCache')}
      </label>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button
          data-testid="calibration-run-btn"
          variant="primary"
          disabled={disabled()}
          onClick={props.onRun}
        >
          {disabled() ? tr('calibration.running') : tr('calibration.run')}
        </Button>
        <Show when={disabled()}>
          <span class="text-xs text-text-muted">{tr('calibration.cancelHint')}</span>
        </Show>
      </div>

      <p
        class="mt-4 rounded-md bg-app px-3 py-2 text-xs font-medium text-text-secondary"
        data-testid="calibration-declaration"
      >
        {tr('calibration.declaration')}
      </p>
    </Card>
  );
}
