import { For, Show, createMemo } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import type { CalibrationHistoryItem, CalibrationHistoryPage, CalibrationHistoryRun } from '../../core/api/benchmark';

interface CalibrationHistoryPanelProps {
  history: CalibrationHistoryPage | null;
  viewing: CalibrationHistoryRun | null;
  onView: (runId: string) => void;
  onBack: () => void;
}

function stampLabel(createdAt: string | null): string {
  if (!createdAt) return '—';
  return new Date(createdAt).toLocaleString('es-VE');
}

/**
 * Historial de corridas guardadas en la BD: permite abrir una anterior sin perder la
 * caché vigente (el sello de cada corrida dice si sigue siendo de la instancia actual).
 */
export function CalibrationHistoryPanel(props: CalibrationHistoryPanelProps) {
  const tr = useLocale();
  const items = createMemo(() => props.history?.items ?? []);

  return (
    <Card data-testid="calibration-history">
      <CardHeader
        title={tr('calibration.history.title')}
        subtitle={tr('calibration.history.subtitle')}
        action={
          <Show when={props.viewing}>
            <button
              type="button"
              class="text-xs font-medium text-fero-blue hover:underline"
              data-testid="calibration-history-back"
              onClick={props.onBack}
            >
              {tr('calibration.history.back')}
            </button>
          </Show>
        }
      />

      <Show when={props.viewing}>
        {(run) => (
          <p
            class="mb-3 rounded-md border border-fero-blue/30 bg-fero-blue/5 px-3 py-2 text-xs text-fero-blue"
            data-testid="calibration-history-viewing"
          >
            {tr('calibration.history.viewing')} {stampLabel(run().createdAt)} ·{' '}
            {tr(`calibration.sweep.${run().sweep ?? 'sensitivity'}`)} · seed {run().seed ?? '—'} ·{' '}
            {tr(`calibration.cacheState.${run().cacheState}`)}
          </p>
        )}
      </Show>

      <Show
        when={items().length}
        fallback={
          <p class="text-sm text-text-muted" data-testid="calibration-history-empty">
            {tr('calibration.history.empty')}
          </p>
        }
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-left text-xs" data-testid="calibration-history-table">
            <thead>
              <tr class="border-b border-border text-text-muted dark:border-dark-border">
                <th class="px-2 py-2 font-semibold">{tr('calibration.history.when')}</th>
                <th class="px-2 py-2 font-semibold">{tr('calibration.mode')}</th>
                <th class="px-2 py-2 font-semibold">{tr('calibration.scenario')}</th>
                <th class="px-2 py-2 font-semibold">{tr('calibration.seed')}</th>
                <th class="px-2 py-2 font-semibold">{tr('calibration.history.stamp')}</th>
                <th class="px-2 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              <For each={items()}>
                {(item: CalibrationHistoryItem) => (
                  <tr class="border-b border-border/60 dark:border-dark-border/60">
                    <td class="px-2 py-2 font-mono">{stampLabel(item.createdAt)}</td>
                    <td class="px-2 py-2">
                      {tr(`calibration.sweep.${item.sweep ?? 'sensitivity'}`)}
                    </td>
                    <td class="px-2 py-2">{item.scenarioId ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{item.seed ?? '—'}</td>
                    <td class="px-2 py-2">
                      <span
                        class={
                          item.cacheState === 'fresh'
                            ? 'text-fero-green-dark'
                            : item.cacheState === 'stale'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-text-muted'
                        }
                      >
                        {tr(`calibration.cacheState.${item.cacheState}`)}
                      </span>
                    </td>
                    <td class="px-2 py-2 text-right">
                      <button
                        type="button"
                        class="text-fero-blue hover:underline"
                        data-testid={`calibration-history-view-${item.runId}`}
                        onClick={() => props.onView(item.runId)}
                      >
                        {tr('calibration.history.view')}
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </Card>
  );
}
