import { For, Show, createMemo } from 'solid-js';
import { FlaskConical } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import { formatComputationSeconds } from '../../core/utils/optimizationResults';
import type { AcoValidationParams, AcoValidationPayload } from '../../core/api/benchmark';
import {
  deltaLabel,
  outcomeLabelKey,
  outcomeVariant,
  profileLabel,
  runLabelKey,
  validationCaveatKeys,
  validationRows,
} from './acoValidationUx';

interface AcoValidationPanelProps {
  validation?: AcoValidationPayload | null;
  /** Combinación que la vista recomienda y que se validaría al pulsar. */
  profile?: AcoValidationParams | null;
  running?: boolean;
  disabled?: boolean;
  onValidate?: () => void;
}

/**
 * Validación de la combinación recomendada contra el perfil estándar.
 *
 * Cierra el hueco que el propio panel declara: el barrido es OFAT y la combinación de los
 * mejores niveles no está medida. Dos corridas en la misma sesión lo resuelven, así que
 * los parámetros del motor dejan de ser una extrapolación.
 */
export function AcoValidationPanel(props: AcoValidationPanelProps) {
  const tr = useLocale();
  const rows = createMemo(() => (props.validation ? validationRows(props.validation) : []));
  const caveats = createMemo(() => (props.validation ? validationCaveatKeys(props.validation) : []));

  return (
    <Card data-testid="calibration-validation">
      <CardHeader
        title={tr('calibration.validation.title')}
        subtitle={tr('calibration.validation.subtitle')}
        action={<FlaskConical size={18} class="text-fero-blue" />}
      />

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          data-testid="calibration-validation-run"
          disabled={props.disabled || props.running || !props.profile}
          onClick={() => props.onValidate?.()}
        >
          {props.running ? tr('calibration.validation.running') : tr('calibration.validation.run')}
        </Button>
        <Show
          when={props.profile}
          fallback={
            <p class="text-xs text-text-muted" data-testid="calibration-validation-profile">
              {tr('calibration.validation.notNeeded')}
            </p>
          }
        >
          {(profile) => (
            <p class="text-xs text-text-muted" data-testid="calibration-validation-profile">
              {tr('calibration.validation.willValidate')}{' '}
              <span class="font-mono text-text-secondary">{profileLabel(profile())}</span>
            </p>
          )}
        </Show>
      </div>

      <Show
        when={props.validation}
        fallback={
          <p class="mt-3 text-sm text-text-muted" data-testid="calibration-validation-empty">
            {tr('calibration.validation.noData')}
          </p>
        }
      >
        {(validation) => (
          <div class="mt-4 space-y-3" data-testid="calibration-validation-result">
            <div class="flex flex-wrap items-center gap-3">
              <Badge variant={outcomeVariant(validation().verdict.outcome)}>
                {tr(outcomeLabelKey(validation().verdict.outcome))}
              </Badge>
              <Show when={deltaLabel(validation())}>
                <span
                  class="font-mono text-sm text-text-primary"
                  data-testid="calibration-validation-delta"
                >
                  {deltaLabel(validation())}
                </span>
              </Show>
              <span class="text-xs text-text-muted">
                {`${tr('calibration.validation.control')} ${validation().verdict.standardKm?.toFixed(1) ?? '—'} km`}
              </span>
            </div>

            <div class="overflow-x-auto">
              <table
                class="w-full min-w-[600px] text-left text-xs"
                data-testid="calibration-validation-table"
              >
                <thead>
                  <tr class="border-b border-border text-text-muted dark:border-dark-border">
                    <th class="px-2 py-2 font-semibold">{tr('calibration.validation.col.run')}</th>
                    <th class="px-2 py-2 font-semibold">{tr('calibration.validation.col.profile')}</th>
                    <th class="px-2 py-2 font-semibold">{tr('calibration.kpi.best')}</th>
                    <th class="px-2 py-2 font-semibold">CPU</th>
                    <th class="px-2 py-2 font-semibold">{tr('calibration.validation.col.iterations')}</th>
                    <th class="px-2 py-2 font-semibold">{tr('calibration.validation.col.earlyStop')}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={rows()}>
                    {(row) => (
                      <tr class="border-b border-border/60 dark:border-dark-border/60">
                        <td class="px-2 py-2 font-medium text-text-primary">
                          {tr(runLabelKey(row.role))}
                        </td>
                        <td class="px-2 py-2 font-mono text-text-muted">{row.profile}</td>
                        <td class="px-2 py-2 font-semibold">
                          <Show
                            when={row.error === null}
                            fallback={<span class="font-normal text-amber-600">{row.error}</span>}
                          >
                            {row.km?.toFixed(1) ?? '—'} km
                          </Show>
                        </td>
                        <td class="px-2 py-2 font-mono">
                          {row.seconds === null ? '—' : formatComputationSeconds(row.seconds)}
                        </td>
                        <td class="px-2 py-2 font-mono">{row.iterations ?? '—'}</td>
                        <td class="px-2 py-2">
                          {row.earlyStop
                            ? tr('calibration.validation.earlyStopYes')
                            : tr('calibration.validation.earlyStopNo')}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <Show when={caveats().length}>
              <ul class="space-y-0.5 text-xs text-text-muted" data-testid="calibration-validation-caveats">
                <For each={caveats()}>
                  {(key) => (
                    <li>
                      {'· '}
                      {tr(key)}
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <p class="text-[11px] text-text-muted">
              {`${tr('calibration.validation.generatedAt')}: ${new Date(
                validation().generatedAt,
              ).toLocaleString('es-VE')} · ${validation().durationSeconds} s · seed ${
                validation().seed ?? '—'
              }`}
            </p>
          </div>
        )}
      </Show>

      <p class="mt-4 border-t border-border pt-3 text-xs text-text-muted dark:border-dark-border">
        {tr('calibration.validation.scope')}
      </p>
    </Card>
  );
}
