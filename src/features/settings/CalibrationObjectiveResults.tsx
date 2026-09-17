import { For, Show, createMemo } from 'solid-js';
import { Button, Card, CardHeader, KpiCard } from '../../design-system/components';
import { CheckCircle2, XCircle as XCircleIcon, MinusCircle } from 'lucide-solid';
import { useLocale } from '../../core/i18n/solid';
import {
  calibrationFilename,
  downloadText,
  jsonText,
  objectiveRunsCsv,
} from './calibrationExport';
import { formatComputationSeconds } from '../../core/utils/optimizationResults';
import type { ObjectiveSweepPayload } from '../../core/api/benchmark';
import { ParetoFrontierChart } from './ParetoFrontierChart';
import { CalibrationReadingList } from './CalibrationReadingList';
import {
  acceptanceCards,
  acceptanceLabel,
  acceptanceSummary,
  bestObjectiveRun,
  frontierRows,
  isBaselineRun,
  isInFrontier,
  objectiveFindings,
  savingLabel,
  shiftLabel,
  tableRows,
  weightsLabel,
  type AcceptanceCard,
} from './calibrationObjectiveUx';

interface CalibrationObjectiveResultsProps {
  payload: ObjectiveSweepPayload;
}

function AcceptanceIcon(props: { ok: AcceptanceCard['ok'] }) {
  return (
    <Show when={props.ok !== null} fallback={<MinusCircle size={16} class="text-text-muted" />}>
      <Show
        when={props.ok}
        fallback={<XCircleIcon size={16} class="text-red-500" />}
      >
        <CheckCircle2 size={16} class="text-fero-green-dark" />
      </Show>
    </Show>
  );
}

/** Resultados del barrido de pesos: tabla, frontera de Pareto y AC-1/AC-2/AC-3. */
export function CalibrationObjectiveResults(props: CalibrationObjectiveResultsProps) {
  const tr = useLocale();

  const cards = createMemo(() => acceptanceCards(props.payload));
  const summary = createMemo(() => acceptanceSummary(props.payload));
  const rows = createMemo(() => tableRows(props.payload));
  const findings = createMemo(() => objectiveFindings(props.payload));
  const best = createMemo(() => bestObjectiveRun(props.payload));

  const exportJson = () =>
    downloadText(
      calibrationFilename('objective', props.payload.generatedAt, 'json'),
      jsonText(props.payload),
      'application/json',
    );

  const exportCsv = () =>
    downloadText(
      calibrationFilename('objective', props.payload.generatedAt, 'csv'),
      objectiveRunsCsv(props.payload),
      'text/csv',
    );

  return (
    <div class="space-y-4" data-testid="calibration-objective-results">
      <p class="text-xs text-text-muted" data-testid="calibration-help">
        {tr('calibration.help.objective')}
      </p>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={tr('calibration.kpi.best')}
          value={best()?.distanceKmOptimized?.toFixed(1) ?? '—'}
          unit="km"
        />
        <KpiCard
          title={tr('calibration.kpi.baseline')}
          value={props.payload.runs[0]?.distanceKmBaseline?.toFixed(1) ?? '—'}
          unit="km"
          iconTone="slate"
          footer={<span class="text-xs text-text-muted">{tr('calibration.kpi.baselineHint')}</span>}
        />
        <KpiCard
          title={tr('calibration.pareto')}
          value={`${frontierRows(props.payload).length}/${props.payload.runs.length}`}
          iconTone="blue"
          footer={<span class="text-xs text-text-muted">{tr('calibration.pareto.footer')}</span>}
        />
        <KpiCard
          title={tr('calibration.acceptance')}
          value={`${summary().ok}/${summary().total}`}
          iconTone="amber"
          footer={
            <Show when={summary().withoutVerdict.length}>
              <span class="text-xs text-text-muted">
                {summary().withoutVerdict.length} {tr('calibration.acNoVerdict')} ·{' '}
                {summary().withoutVerdict.map((id) => acceptanceLabel(id)).join(', ')}
              </span>
            </Show>
          }
        />
      </div>

      <Card data-testid="calibration-acceptance">
        <CardHeader
          title={tr('calibration.acceptance')}
          subtitle={`${tr('calibration.generatedAt')}: ${new Date(
            props.payload.generatedAt,
          ).toLocaleString('es-VE')} · ${props.payload.durationSeconds} s · seed ${
            props.payload.seed
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
        <div class="grid gap-3 sm:grid-cols-3">
          <For each={cards()}>
            {(card) => (
              <div
                class="rounded-md border border-default bg-app p-3"
                data-testid={`calibration-${card.id}`}
                data-ok={String(card.ok)}
              >
                <div class="flex items-center gap-2">
                  <AcceptanceIcon ok={card.ok} />
                  <p class="text-sm font-semibold text-text-primary">{tr(card.titleKey)}</p>
                </div>
                <p class="mt-1 text-xs text-text-muted">{card.criterion}</p>
                <p class="mt-1 text-xs text-text-secondary">{card.detail}</p>
              </div>
            )}
          </For>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={tr('calibration.pareto')}
          subtitle={tr('calibration.pareto.hint')}
        />
        <ParetoFrontierChart
          runs={rows().filter((run) => !run.error)}
          frontier={frontierRows(props.payload)}
          frontierLabel={tr('calibration.pareto')}
          distanceLabel={tr('calibration.kpi.best')}
          makespanLabel="máx. horas de ruta"
        />

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[860px] text-left text-xs" data-testid="calibration-objective-table">
            <thead>
              <tr class="border-b border-border text-text-muted dark:border-dark-border">
                <th class="px-2 py-2 font-semibold">Caso</th>
                <th class="px-2 py-2 font-semibold">Jornada</th>
                <th class="px-2 py-2 font-semibold">Pesos</th>
                <th class="px-2 py-2 font-semibold">Distancia</th>
                <th class="px-2 py-2 font-semibold">Ahorro</th>
                <th class="px-2 py-2 font-semibold">Vehículos</th>
                <th class="px-2 py-2 font-semibold">máx. h</th>
                <th class="px-2 py-2 font-semibold">Holgura h</th>
                <th class="px-2 py-2 font-semibold">≤ obj. %</th>
                <th class="px-2 py-2 font-semibold">σ h</th>
                <th class="px-2 py-2 font-semibold">Equidad</th>
                <th class="px-2 py-2 font-semibold">CPU</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(run) => (
                  <tr
                    class={`border-b border-border/60 dark:border-border/60 ${
                      isInFrontier(props.payload, run) ? 'bg-fero-green/5' : ''
                    }`}
                  >
                    <td class="px-2 py-2">
                      {run.label}
                      <Show when={isInFrontier(props.payload, run)}>
                        <span class="ml-2 rounded bg-fero-green/15 px-1 text-[10px] font-semibold text-fero-green-dark">
                          Pareto
                        </span>
                      </Show>
                      <Show when={isBaselineRun(run)}>
                        <span class="ml-2 rounded bg-app px-1 text-[10px] font-semibold text-text-muted">
                          {tr('calibration.baselineRow')}
                        </span>
                      </Show>
                    </td>
                    <td class="px-2 py-2">{shiftLabel(run)}</td>
                    <td class="px-2 py-2 font-mono">{weightsLabel(run)}</td>
                    <td class="px-2 py-2 font-semibold">
                      {run.distanceKmOptimized?.toFixed(1) ?? '—'} km
                    </td>
                    <td class="px-2 py-2 font-mono">{savingLabel(run)}</td>
                    <td class="px-2 py-2">{run.activeVehicles ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{run.maxRouteHours?.toFixed(2) ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{run.shiftSlackHours?.toFixed(2) ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{run.finishUnderTargetPct?.toFixed(1) ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{run.workloadStdHours?.toFixed(2) ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">{run.fairnessIndex?.toFixed(2) ?? '—'}</td>
                    <td class="px-2 py-2 font-mono">
                      {formatComputationSeconds(run.computationSeconds ?? 0)}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <p class="mt-2 text-[11px] text-text-muted">{tr('calibration.legend.objective')}</p>
        </div>
      </Card>

      <CalibrationReadingList title={tr('calibration.reading')} findings={findings()} />
    </div>
  );
}
