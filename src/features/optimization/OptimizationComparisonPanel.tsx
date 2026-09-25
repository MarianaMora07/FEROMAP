import { For } from 'solid-js';
import { Card } from '../../design-system/components';
import {
  buildBaselineAcoComparisonRows,
  formatSavingPct,
} from '../../core/utils/optimizationResults';
import type { KpiMetrics, KpiView } from '../../data/types/simulation';
import { OptimizationServiceBadges } from './OptimizationServiceBadges';

interface OptimizationComparisonPanelProps {
  kpis: KpiMetrics;
  kpiView?: KpiView;
}

function savingClass(value: number): string {
  if (value > 0) return 'text-fero-green-dark font-semibold';
  if (value < 0) return 'text-amber-700 font-semibold';
  return 'text-text-muted';
}

function metricKey(metric: string, view: KpiView): boolean {
  if (view === 'distance') return metric === 'Distancia';
  if (view === 'time') return metric === 'Tiempo';
  return metric === 'CO₂ estimado';
}

export function OptimizationComparisonPanel(props: OptimizationComparisonPanelProps) {
  const view = () => props.kpiView ?? props.kpis.kpiView ?? 'distance';
  const rows = () => buildBaselineAcoComparisonRows(props.kpis);

  return (
    <Card data-testid="optimization-comparison-panel">
      {/* Sin título propio: el encabezado «Previsto» del tab Resultados ya lo rotula, y el panel
          repetía «Línea base del turno vs. plan». Aquí solo se indica la métrica destacada. */}
      <p class="mb-3 text-sm text-text-muted">
        Mejora estimada frente a la operación actual — métrica destacada:{' '}
        {view() === 'distance' ? 'distancia' : view() === 'time' ? 'tiempo' : 'CO₂'}
      </p>
      <div class="pb-3">
        <OptimizationServiceBadges kpis={props.kpis} />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[28rem] text-sm">
          <thead>
            <tr class="border-b border-default text-left text-[10px] uppercase tracking-wide text-text-muted">
              <th class="pb-2 pr-3 font-semibold">Métrica</th>
              <th class="pb-2 pr-3 font-semibold">Línea base</th>
              <th class="pb-2 pr-3 font-semibold">Plan</th>
              <th class="pb-2 font-semibold">Ahorro</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default/70">
            <For each={rows()}>
              {(row) => (
                <tr class={metricKey(row.metric, view()) ? 'bg-fero-green/10' : undefined}>
                  <td class="py-2.5 pr-3 font-medium text-text-primary">{row.metric}</td>
                  <td class="py-2.5 pr-3 text-text-secondary">{row.baseline}</td>
                  <td class="py-2.5 pr-3 text-text-secondary">{row.aco}</td>
                  <td class={`py-2.5 ${savingClass(row.savingPct)}`}>
                    {formatSavingPct(row.savingPct)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
