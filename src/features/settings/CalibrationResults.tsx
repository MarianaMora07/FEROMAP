import { For, Show, createMemo, createSignal } from 'solid-js';
import { TrendingDown } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import { formatComputationSeconds } from '../../core/utils/optimizationResults';
import { calibrationFilename, downloadText, jsonText, sensitivityAxisCsv } from './calibrationExport';
import type { AcoSensitivityPayload, CalibrationAxis } from '../../core/api/benchmark';
import { CalibrationAxisChart } from './CalibrationAxisChart';
import { CalibrationReadingList } from './CalibrationReadingList';
import {
  AXIS_ORDER,
  amplitudeLabel,
  baselineKm,
  isValidRun,
  levelLabel,
  readingFindings,
  summarizeAxes,
  mostSensitiveAxis,
  stableAxes,
  type CalibrationAxisSummary,
} from './calibrationSensitivityUx';

interface CalibrationResultsProps {
  payload: AcoSensitivityPayload;
}

/** Resultados del estudio de sensibilidad ACO: resumen, ejes, gráfico, tabla y lectura. */
export function CalibrationResults(props: CalibrationResultsProps) {
  const tr = useLocale();
  const [axis, setAxis] = createSignal<CalibrationAxis>('ants');

  const summaries = createMemo(() => summarizeAxes(props.payload.runs));
  const summary = createMemo<CalibrationAxisSummary | undefined>(() =>
    summaries().find((item) => item.axis === axis()),
  );
  const sensitive = createMemo(() => mostSensitiveAxis(summaries()));
  const stable = createMemo(() => stableAxes(summaries()));
  const findings = createMemo(() => readingFindings(props.payload));

  const exportJson = () =>
    downloadText(
      calibrationFilename('sensitivity', props.payload.generatedAt, 'json'),
      jsonText(props.payload),
      'application/json',
    );

  const exportCsv = () =>
    downloadText(
      calibrationFilename('sensitivity', props.payload.generatedAt, 'csv'),
      sensitivityAxisCsv(props.payload, axis()),
      'text/csv',
    );

  return (
    <div class="space-y-4" data-testid="calibration-sensitivity-results">
      <p class="text-xs text-text-muted" data-testid="calibration-help">
        {tr('calibration.help.sensitivity')}
      </p>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={tr('calibration.kpi.best')}
          value={summary()?.bestKm?.toFixed(1) ?? '—'}
          unit="km"
          icon={<TrendingDown size={16} />}
        />
        <KpiCard
          title={tr('calibration.kpi.baseline')}
          value={baselineKm(props.payload.runs)?.toFixed(1) ?? '—'}
          unit="km"
          iconTone="slate"
          footer={<span class="text-xs text-text-muted">{tr('calibration.kpi.baselineHint')}</span>}
        />
        <KpiCard
          title={tr('calibration.kpi.axis')}
          value={sensitive() ? tr(sensitive()!.labelKey, sensitive()!.axis) : '—'}
          unit={sensitive()?.amplitudePct ? `${sensitive()!.amplitudePct!.toFixed(1)} %` : undefined}
          iconTone="amber"
        />
        <KpiCard
          title={tr('calibration.kpi.stable')}
          value={`${stable().length}/${summaries().length}`}
          iconTone="blue"
        />
      </div>

      <Card>
        <CardHeader
          title={tr('calibration.axisRanking')}
          subtitle={`${tr('calibration.generatedAt')}: ${new Date(
            props.payload.generatedAt,
          ).toLocaleString('es-VE')} · ${props.payload.durationSeconds} s · seed ${
            props.payload.seed ?? '—'
          }`}
          action={
            <div class="flex gap-2">
              <Button variant="outline" size="sm" data-testid="calibration-export-json" onClick={exportJson}>
                {tr('calibration.export.json')}
              </Button>
              <Button variant="outline" size="sm" data-testid="calibration-export-csv" onClick={exportCsv}>
                {tr('calibration.export.csv')}
              </Button>
            </div>
          }
        />

        <div class="overflow-x-auto border-b border-border dark:border-dark-border">
          <nav class="flex min-w-max gap-1" aria-label={tr('calibration.axisRanking')}>
            <For each={AXIS_ORDER}>
              {(item) => {
                const itemSummary = () => summaries().find((summary) => summary.axis === item);
                const isSensitive = () => sensitive()?.axis === item;
                return (
                  <button
                    type="button"
                    data-testid={`calibration-axis-${item}`}
                    aria-current={axis() === item ? 'page' : undefined}
                    onClick={() => setAxis(item)}
                    class={`relative px-3 py-2 text-sm font-medium transition-colors ${
                      axis() === item ? 'text-fero-blue' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {tr(`calibration.axis.${item}`, item)}
                    <span
                      class={`ml-1.5 font-mono text-[10px] ${
                        isSensitive() ? 'text-amber-600 dark:text-amber-400' : 'text-text-muted'
                      }`}
                      data-testid={`calibration-axis-amplitude-${item}`}
                    >
                      {isSensitive() ? '▲ ' : ''}
                      {itemSummary() ? amplitudeLabel(itemSummary()!) : '—'}
                    </span>
                    {axis() === item && (
                      <span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fero-blue" />
                    )}
                  </button>
                );
              }}
            </For>
          </nav>
        </div>

        <Show when={summary()} fallback={<p class="mt-3 text-sm text-text-muted">Sin datos del eje.</p>}>
          {(current) => (
            <>
              <div class="mt-4">
                <CalibrationAxisChart
                  runs={current().ranked}
                  labels={current().ranked.map((run) => levelLabel(run))}
                  baselineKm={baselineKm(props.payload.runs)}
                  distanceLabel={tr('calibration.kpi.best')}
                  baselineLabel={tr('calibration.kpi.baseline')}
                  xAxisTitle={tr(current().labelKey, current().axis)}
                />
              </div>

              <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-[720px] text-left text-xs" data-testid="calibration-axis-table">
                  <thead>
                    <tr class="border-b border-border text-text-muted dark:border-dark-border">
                      <th class="px-2 py-2 font-semibold">Nivel</th>
                      <th class="px-2 py-2 font-semibold">CPU</th>
                      <th class="px-2 py-2 font-semibold">Distancia</th>
                      <th class="px-2 py-2 font-semibold">Ahorro</th>
                      <th class="px-2 py-2 font-semibold">Iteraciones</th>
                      <th class="px-2 py-2 font-semibold">Early-stop</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={[...current().ranked, ...current().excluded]}>
                      {(run) => (
                        <tr
                          class={`border-b border-border/60 dark:border-dark-border/60 ${
                            run === current().best ? 'bg-fero-green/5' : ''
                          }`}
                        >
                          <td class="px-2 py-2">
                            {levelLabel(run)}
                            <Show when={run === current().best}>
                              <span class="ml-2 rounded bg-fero-green/15 px-1 text-[10px] font-semibold text-fero-green-dark">
                                {tr('calibration.bestLevel')}
                              </span>
                            </Show>
                          </td>
                          <td class="px-2 py-2 font-mono">
                            {formatComputationSeconds(run.computationSeconds ?? 0)}
                          </td>
                          <td class="px-2 py-2 font-semibold">
                            {run.distanceKmOptimized?.toFixed(1) ?? '—'} km
                          </td>
                          <td class="px-2 py-2 font-mono">{run.savingPct?.toFixed(1) ?? '—'}%</td>
                          <td class="px-2 py-2 font-mono">{run.acoIterationsRun ?? '—'}</td>
                          <td class="px-2 py-2">
                            <Show
                              when={isValidRun(run)}
                              fallback={<span class="text-amber-600">{tr('calibration.excluded')}</span>}
                            >
                              {run.acoStoppedEarly ? 'sí' : 'no'}
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <p class="mt-2 text-[11px] text-text-muted">{tr('calibration.legend.sensitivity')}</p>
              </div>
            </>
          )}
        </Show>
      </Card>

      <CalibrationReadingList title={tr('calibration.reading')} findings={findings()} />
    </div>
  );
}
