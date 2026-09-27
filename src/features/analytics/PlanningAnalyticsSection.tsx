import { Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { CalendarDays } from 'lucide-solid';
import { Line } from 'solid-chartjs';
import { Card, CardHeader, KpiCard } from '../../design-system/components';
import { fetchPlanningAnalytics, fetchPlanningDashboardSnapshot } from '../../core/api/planningAnalytics';
import { weeklyPlanHref } from '../../core/planning/weekendClosureUx';
import { WeeklySummaryCard } from './WeeklySummaryCard';
import { WeekendClosureChecklist } from './WeekendClosureChecklist';

interface PlanningAnalyticsSectionProps {
  weekFrom: string;
  weekTo: string;
}

export function PlanningAnalyticsSection(props: PlanningAnalyticsSectionProps) {
  const [data] = createResource(
    () => ({ from: props.weekFrom, to: props.weekTo }),
    ({ from, to }) => fetchPlanningAnalytics(from, to),
  );
  const [snapshot] = createResource(() => fetchPlanningDashboardSnapshot());

  const directivo = () => data()?.levels.directivo;
  const administrativo = () => data()?.levels.administrativo;
  const operativo = () => data()?.levels.operativo;
  const trends = () => data()?.trends;

  const trendChart = () => ({
    labels: trends()?.labels ?? [],
    datasets: [
      {
        label: 'Cumplimiento semanal %',
        data: trends()?.weeklyCompliancePct ?? [],
        borderColor: '#34D634',
        tension: 0.35,
        yAxisID: 'y',
      },
      {
        label: 'Carry-over %',
        data: trends()?.carryOverPct ?? [],
        borderColor: '#f59e0b',
        tension: 0.35,
        yAxisID: 'y',
      },
    ],
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="font-heading text-lg font-bold text-text-primary dark:text-white">
            Planificación por nivel
          </h2>
          <p class="text-sm text-text-secondary">
            Tendencias directivas, administrativas y operativas en el rango seleccionado.
          </p>
        </div>
        <A
          href={weeklyPlanHref(snapshot()?.weeklyPlan?.id)}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-fero-blue hover:underline"
        >
          <CalendarDays size={16} />
          Ver semana en plan semanal
        </A>
      </div>

      <Show when={data()}>
        {(analytics) => (
          <>
            <WeeklySummaryCard analytics={analytics()} snapshot={snapshot() ?? null} />
            <WeekendClosureChecklist weekFrom={props.weekFrom} weekTo={props.weekTo} />
          </>
        )}
      </Show>

      <div class="grid gap-3 md:grid-cols-3">
        <KpiCard
          title="Cumplimiento semanal"
          value={`${directivo()?.weeklyCompliancePct ?? 0}%`}
          iconTone="green"
          footer={<span class="text-xs text-text-muted">Nivel directivo</span>}
        />
        <KpiCard
          title="Carry-over"
          value={`${directivo()?.carryOverPct ?? 0}%`}
          iconTone="amber"
          footer={<span class="text-xs text-text-muted">Pendientes de semanas anteriores</span>}
        />
        <KpiCard
          title="Km planificado vs ejecutado"
          value={`${directivo()?.executedKm ?? 0} / ${directivo()?.plannedKm ?? 0}`}
          iconTone="blue"
          footer={<span class="text-xs text-text-muted">Varianza {directivo()?.kmVariancePct ?? 0}%</span>}
        />
      </div>

      <div class="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader title="Administrativo" subtitle="Plan del día y pendientes" />
          <ul class="space-y-2 text-sm text-text-secondary">
            <li>Planes diarios: {administrativo()?.dailyPlans ?? 0}</li>
            <li>Optimizados: {administrativo()?.optimizedDays ?? 0}</li>
            <li>Despachados: {administrativo()?.dispatchedDays ?? 0}</li>
            <li>
              Cerrados: {administrativo()?.closedDays ?? 0} / {administrativo()?.scheduledDays ?? '—'}
            </li>
            <li>Pendientes abiertos: {administrativo()?.openPendingVisits ?? 0}</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Operativo" subtitle="Monitoreo y recálculos" />
          <ul class="space-y-2 text-sm text-text-secondary">
            <li>Incidencias abiertas: {operativo()?.openIncidents ?? 0}</li>
            <li>Recálculos operativos: {operativo()?.operationalRecalcs ?? 0}</li>
            <li>Rutas en progreso: {operativo()?.routesInProgress ?? 0}</li>
          </ul>
        </Card>
        <Card class="min-h-[220px]">
          <CardHeader title="Tendencias semanales" />
          <Show
            when={(trends()?.labels.length ?? 0) > 0}
            fallback={<p class="text-sm text-text-secondary">Sin datos en el rango.</p>}
          >
            <div class="h-40">
              <Line
                data={trendChart()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                  scales: {
                    y: { beginAtZero: true, max: 100 },
                  },
                }}
              />
            </div>
          </Show>
        </Card>
      </div>
    </div>
  );
}
