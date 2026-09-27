import { A } from '@solidjs/router';
import { TrendingDown } from 'lucide-solid';
import { createResource } from 'solid-js';
import { KpiCard } from '../../design-system/components';
import { fetchPlanVsRealReport } from '../../core/api/planningAnalytics';

/**
 * KPI del dashboard: desviación media previsto vs. real (Fase 5), calculada desde
 * los días cerrados de los últimos ~28 días.
 */
export function DashboardPlanVsRealKpi() {
  const [report] = createResource(() => fetchPlanVsRealReport({ limit: 200 }));
  const summary = () => report()?.summary;
  const deviation = () => summary()?.avgDistanceDeviationPct ?? null;

  return (
    <KpiCard
      title="Desviación media previsto vs. real"
      value={deviation() == null ? '—' : `${deviation()!.toFixed(1)}%`}
      unit={deviation() == null ? undefined : 'km'}
      icon={<TrendingDown size={28} />}
      iconTone="amber"
      footer={
        <A
          href="/planning/history"
          class="text-sm font-medium text-fero-blue underline-offset-2 hover:underline"
        >
          Ver previsto vs. real
        </A>
      }
    />
  );
}
