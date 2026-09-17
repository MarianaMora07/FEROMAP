import { For, Show, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { Card, CardHeader } from '../../design-system/components';
import { Lightbulb } from 'lucide-solid';
import { useLocale } from '../../core/i18n/solid';
import type { AcoSensitivityPayload, ObjectiveSweepPayload } from '../../core/api/benchmark';
import { calibrationAdvice } from './calibrationAdvisorUx';

interface CalibrationAdvicePanelProps {
  sensitivity?: AcoSensitivityPayload;
  objective?: ObjectiveSweepPayload;
}

/**
 * Recomendación de calibración derivada de la evidencia en caché.
 *
 * Solo repite lo medido (mejor nivel por eje, punto aceptado por AC-1/AC-2 y alternativas
 * cercanas) y declara sus límites: barrido OFAT, una instancia y una semilla.
 */
export function CalibrationAdvicePanel(props: CalibrationAdvicePanelProps) {
  const tr = useLocale();
  const advice = createMemo(() =>
    calibrationAdvice({ sensitivity: props.sensitivity, objective: props.objective }),
  );

  return (
    <Card data-testid="calibration-advice">
      <CardHeader
        title={tr('calibration.advice.title')}
        subtitle={tr('calibration.advice.subtitle')}
        action={<Lightbulb size={18} class="text-amber-500" />}
      />

      <Show when={advice().profile || advice().operating} fallback={<p class="text-sm text-text-muted">{tr('calibration.advice.noEvidence')}</p>}>
        <div class="grid gap-4 lg:grid-cols-2">
          <Show when={advice().profile}>
            {(profile) => (
              <div data-testid="calibration-advice-profile">
                <h4 class="text-sm font-semibold text-text-primary">{tr('calibration.advice.profile')}</h4>
                <ul class="mt-2 space-y-1 text-sm text-text-secondary">
                  <For each={profile().picks}>
                    {(pick) => (
                      <li>
                        <span class="font-medium text-text-primary">{tr(pick.labelKey, pick.axis)}</span>
                        {' → '}
                        <Show
                          when={!pick.keep}
                          fallback={<span class="text-text-muted">{tr('calibration.advice.keepLevel')}</span>}
                        >
                          <span class="font-mono">{pick.level}</span>
                          {` · ${pick.km?.toFixed(1)} km`}
                          <Show when={pick.amplitudeKm !== null && pick.amplitudeKm > 0}>
                            <span class="text-text-muted">{` (±${pick.amplitudeKm?.toFixed(1)} km · ${pick.amplitudePct})`}</span>
                          </Show>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>

                <Show when={profile().earlyStop}>
                  <p class="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    {tr('calibration.advice.earlyStop')}
                  </p>
                </Show>

                <p class="mt-2 text-xs text-text-muted">{tr('calibration.advice.combination')}</p>
              </div>
            )}
          </Show>

          <Show when={advice().operating}>
            {(operating) => (
              <div data-testid="calibration-advice-operating">
                <h4 class="text-sm font-semibold text-text-primary">{tr('calibration.advice.operating')}</h4>
                <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p class="text-xs text-text-muted">{tr('calibration.advice.weights')}</p>
                    <p class="font-mono text-text-primary">{operating().weights}</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-muted">{tr('calibration.kpi.best')}</p>
                    <p class="font-semibold text-text-primary">{operating().km.toFixed(1)} km</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-muted">máx. h</p>
                    <p class="font-mono text-text-primary">{operating().maxRouteHours?.toFixed(2) ?? '—'}</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-muted">≤ obj. %</p>
                    <p class="font-mono text-text-primary">{operating().finishUnderTargetPct?.toFixed(0) ?? '—'}</p>
                  </div>
                </div>
                <Show when={operating().acceptedBy.length}>
                  <p class="mt-2 text-xs text-fero-green-dark">
                    {tr('calibration.advice.acceptedBy')} {operating().acceptedBy.join(' + ')}
                  </p>
                </Show>

                <Show when={advice().alternatives.length}>
                  <p class="mt-3 text-xs font-medium text-text-secondary">{tr('calibration.advice.alternatives')}</p>
                  <ul class="mt-1 space-y-0.5 text-xs text-text-muted">
                    <For each={advice().alternatives}>
                      {(item) => (
                        <li>
                          <span class="font-mono">{item.weights}</span>
                          {` · ${item.km.toFixed(1)} km · ${tr(item.noteKey)}`}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>

                <Show when={advice().avoid.length}>
                  <p class="mt-3 text-xs font-medium text-text-secondary">{tr('calibration.advice.avoid')}</p>
                  <ul class="mt-1 space-y-0.5 text-xs text-text-muted">
                    <For each={advice().avoid}>
                      {(item) => (
                        <li>
                          <span class="font-mono">{item.weights}</span>
                          {` · ${item.km.toFixed(1)} km`}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 dark:border-dark-border">
        <p class="text-xs text-text-muted">{tr('calibration.advice.scope')}</p>
        <A
          href="/settings"
          class="text-xs font-medium text-fero-blue hover:underline"
          data-testid="calibration-advice-settings-link"
        >
          {tr('calibration.advice.editInSettings')}
        </A>
      </div>
    </Card>
  );
}
