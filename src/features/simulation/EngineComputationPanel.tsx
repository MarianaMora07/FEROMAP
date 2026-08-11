import { Show } from 'solid-js';
import { Cpu } from 'lucide-solid';
import { AcoConvergenceChart } from './AcoConvergenceChart';
import type { EngineMetrics, KpiMetrics } from '../../data/types/simulation';
import { formatComputationSeconds, formatEngineMetricsSummary } from '../../core/utils/optimizationResults';
import { Card, CardHeader } from '../../design-system/components';

interface EngineComputationPanelProps {
  kpis: KpiMetrics;
}

function MetricRow(props: { label: string; value: string; hint?: string }) {
  return (
    <div class="flex items-start justify-between gap-3 text-sm">
      <dt class="text-text-secondary">{props.label}</dt>
      <dd class="text-right">
        <span class="font-semibold text-text-primary dark:text-white">{props.value}</span>
        <Show when={props.hint}>
          <p class="mt-0.5 text-[11px] text-text-muted">{props.hint}</p>
        </Show>
      </dd>
    </div>
  );
}

export function EngineComputationPanel(props: EngineComputationPanelProps) {
  const metrics = (): EngineMetrics | undefined => props.kpis.engineMetrics;

  return (
    <Show when={metrics()}>
      {(m) => (
        <Card>
          <CardHeader
            title="Tiempo de cálculo"
            subtitle="Duración real del motor en el servidor (no confundir con la duración operativa de la ruta)."
          />
          <div class="mb-3 flex items-start gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-xs text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover">
            <Cpu size={16} class="mt-0.5 shrink-0 text-fero-blue" />
            <p>{formatEngineMetricsSummary(m())}</p>
          </div>
          <dl class="space-y-2.5">
            <MetricRow label="Total" value={formatComputationSeconds(m().computationSeconds)} />
            <MetricRow
              label="Metaheurística ACO"
              value={formatComputationSeconds(m().acoSeconds)}
              hint={`${m().acoAnts} hormigas × ${m().acoIterationsRun ?? m().acoIterations}/${m().acoIterations} iteraciones`}
            />
            <Show when={m().acoStoppedEarly}>
              <MetricRow
                label="Parada anticipada"
                value="Sí"
                hint={`Sin mejora durante ${m().acoPatience ?? '—'} iteraciones consecutivas`}
              />
            </Show>
            <Show when={m().matrixCacheHit}>
              <MetricRow label="Matriz de costos" value="Reutilizada desde caché" />
            </Show>
            <Show when={m().matrixCacheIncremental}>
              <MetricRow
                label="Matriz incremental"
                value={`${m().matrixParentPointCount ?? '—'} → ${m().customers} puntos`}
                hint={`${m().matrixPatchedCells ?? 0} celdas recalculadas`}
              />
            </Show>
            <Show when={m().graphLoadSource}>
              <MetricRow label="Origen del grafo" value={m().graphLoadSource!} />
            </Show>
            <Show when={(m().acoParallelWorkers ?? 1) > 1}>
              <MetricRow
                label="Paralelismo ACO"
                value={`${m().acoParallelWorkers} procesos`}
                hint="Hormigas evaluadas en paralelo por iteración"
              />
            </Show>
            <MetricRow
              label="Grafo y matriz de costos"
              value={formatComputationSeconds(m().graphLoadSeconds)}
            />
            <MetricRow
              label="Persistencia y KPIs"
              value={formatComputationSeconds(m().overheadSeconds)}
            />
          </dl>
          <Show when={(m().acoConvergence?.length ?? 0) > 0}>
            <div class="mt-4 border-t border-border pt-4 dark:border-dark-border">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Convergencia ACO
              </p>
              <AcoConvergenceChart points={m().acoConvergence ?? []} />
            </div>
          </Show>
          <p class="mt-3 text-[11px] text-text-muted">
            Estos valores se configuran en el paso 1 (perfil ACO). El servidor también acepta{' '}
            <code class="rounded bg-slate-100 px-1 dark:bg-dark-surface">ACO_ANTS</code> y{' '}
            <code class="rounded bg-slate-100 px-1 dark:bg-dark-surface">ACO_ITERATIONS</code> como valores por defecto
            cuando la simulación no los envía.
          </p>
        </Card>
      )}
    </Show>
  );
}
