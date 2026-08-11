import { Show, createSignal } from 'solid-js';
import { Download } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard } from '../../design-system/components';
import { downloadWeeklyPlanPdf } from '../../core/api/planning';
import type { PlanningAnalyticsSummary } from '../../core/api/planningAnalytics';
import type { PlanningDashboardSnapshot } from '../../core/api/planningAnalytics';

interface WeeklySummaryCardProps {
  analytics: PlanningAnalyticsSummary;
  snapshot: PlanningDashboardSnapshot | null;
}

export function WeeklySummaryCard(props: WeeklySummaryCardProps) {
  const [downloading, setDownloading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const directivo = () => props.analytics.levels.directivo;
  const administrativo = () => props.analytics.levels.administrativo;
  const weekly = () => props.snapshot?.weeklyPlan;

  const handleDownload = async () => {
    const planId = weekly()?.id;
    if (!planId) {
      setError('No hay plan semanal activo para exportar.');
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadWeeklyPlanPdf(planId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `resumen-semana-${weekly()!.weekStartDate}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el resumen');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card class="border-violet-200/60 dark:border-violet-900/40">
      <CardHeader
        title="Resumen de la semana"
        subtitle="Planifiqué → ejecuté → mido — cierre del ciclo directivo"
        action={
          <Button
            size="sm"
            variant="primary"
            class="gap-1.5"
            icon={<Download size={14} />}
            loading={downloading()}
            disabled={!weekly()?.id}
            onClick={() => void handleDownload()}
          >
            Resumen de la semana
          </Button>
        }
      />
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Cumplimiento"
          value={`${directivo()?.weeklyCompliancePct ?? 0}%`}
          iconTone="green"
          footer={<span class="text-xs text-text-muted">Visitas cumplidas vs plan</span>}
        />
        <KpiCard
          title="Carry-over"
          value={`${directivo()?.carryOverPct ?? 0}%`}
          iconTone="amber"
          footer={<span class="text-xs text-text-muted">Pendientes de semanas previas</span>}
        />
        <KpiCard
          title="Jornadas cerradas"
          value={`${administrativo()?.closedDays ?? 0}/${administrativo()?.scheduledDays ?? administrativo()?.dailyPlans ?? 0}`}
          iconTone="blue"
          footer={<span class="text-xs text-text-muted">Administrativo</span>}
        />
        <KpiCard
          title="Km ejecutados"
          value={`${directivo()?.executedKm ?? 0}`}
          iconTone="green"
          footer={
            <span class="text-xs text-text-muted">
              Plan {directivo()?.plannedKm ?? 0} km · varianza {directivo()?.kmVariancePct ?? 0}%
            </span>
          }
        />
      </div>
      <Show when={weekly()}>
        {(plan) => (
          <p class="mt-3 text-xs text-text-muted">
            Semana {plan().weekStartDate} — {plan().weekEndDate} · {plan().daysConfigured} días ·{' '}
            {plan().scheduledPoints} puntos programados
          </p>
        )}
      </Show>
      <Show when={error()}>
        <p class="mt-2 text-sm text-red-500">{error()}</p>
      </Show>
    </Card>
  );
}
