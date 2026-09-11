import { Show, createResource } from 'solid-js';
import { Download } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import { downloadPlanVsRealCsv, fetchPlanVsRealReport } from '../../core/api/planningAnalytics';

function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function deviationClass(pct: number | null | undefined): string {
  if (pct == null) return 'text-text-secondary';
  if (pct > 10) return 'text-red-600 dark:text-red-300';
  if (pct > 0) return 'text-amber-700 dark:text-amber-200';
  return 'text-fero-green-dark';
}

interface ReportsPlanVsRealCardProps {
  from: string;
  to: string;
}

/** Exportable del reporte previsto vs. real en `/reports` (Fase 5). */
export function ReportsPlanVsRealCard(props: ReportsPlanVsRealCardProps) {
  const [report] = createResource(
    () => `${props.from}|${props.to}`,
    () => fetchPlanVsRealReport({ weekFrom: props.from, weekTo: props.to, limit: 365 }),
  );
  const summary = () => report()?.summary;

  return (
    <Card>
      <CardHeader
        title="Previsto vs. real"
        subtitle="Desviación media por día y días con contingencia"
        action={
          <Button
            size="sm"
            variant="outline"
            class="gap-2"
            icon={<Download size={14} />}
            data-testid="reports-plan-vs-real-export"
            onClick={() => void downloadPlanVsRealCsv({ weekFrom: props.from, weekTo: props.to, limit: 365 })}
          >
            Descargar CSV
          </Button>
        }
      />
      <Show when={report.loading}>
        <p class="text-sm text-text-muted">Calculando desviaciones…</p>
      </Show>
      <Show when={!report.loading && summary()}>
        {(data) => (
          <div class="grid gap-3 sm:grid-cols-4" data-testid="reports-plan-vs-real">
            <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
              <p class="text-xs text-text-muted">Días comparados</p>
              <p class="text-2xl font-bold text-text-primary dark:text-white">{data().days}</p>
            </div>
            <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
              <p class="text-xs text-text-muted">Desviación media km</p>
              <p class={`text-2xl font-bold ${deviationClass(data().avgDistanceDeviationPct)}`}>
                {formatPct(data().avgDistanceDeviationPct)}
              </p>
            </div>
            <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
              <p class="text-xs text-text-muted">Cumplimiento medio</p>
              <p class="text-2xl font-bold text-text-primary dark:text-white">
                {formatPct(data().avgCompletionPct)}
              </p>
            </div>
            <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
              <p class="text-xs text-text-muted">Días con incidencia</p>
              <p class="text-2xl font-bold text-amber-700 dark:text-amber-200">
                {data().daysWithIncidents}
              </p>
            </div>
          </div>
        )}
      </Show>
      <Show when={!report.loading && !summary()}>
        <p class="text-sm text-text-muted">Sin datos en el período.</p>
      </Show>
    </Card>
  );
}
