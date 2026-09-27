import { For, Show, createResource } from 'solid-js';
import { Download } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../../design-system/components';
import {
  downloadPlanVsRealCsv,
  fetchPlanVsRealReport,
  type PlanVsRealCause,
} from '../../../core/api/planningAnalytics';
import {
  addDaysToIso,
  formatWeekdayLabel,
  isoWeekdayMon0,
} from '../../../core/planning/weeklyPlanCalendar';

function formatKm(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1);
}

function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function causeLabel(cause: PlanVsRealCause): string {
  if (cause === 'breakdown') return 'Avería';
  if (cause === 'other') return 'Contingencia';
  return 'Sin incidencia';
}

function deviationClass(pct: number | null | undefined): string {
  if (pct == null) return 'text-text-secondary';
  if (pct > 10) return 'text-red-600 dark:text-red-300';
  if (pct > 0) return 'text-amber-700 dark:text-amber-200';
  return 'text-fero-green-dark';
}

interface PlanningHistoryPlanVsRealSectionProps {
  weekStart: string;
}

/**
 * Reporte previsto vs. real de la semana (Fase 5): desviaciones por día y causa
 * (contingencias registradas en `VehicleIncident`). Exportable a CSV.
 */
export function PlanningHistoryPlanVsRealSection(props: PlanningHistoryPlanVsRealSectionProps) {
  const weekEnd = () => addDaysToIso(props.weekStart, 6);
  const [report] = createResource(
    () => props.weekStart,
    (weekStart) => fetchPlanVsRealReport({ weekFrom: weekStart, weekTo: addDaysToIso(weekStart, 6) }),
  );

  return (
    <Card>
      <CardHeader
        title="Previsto vs. real"
        subtitle="Desviaciones por día y causa (contingencias)"
        action={
          <Button
            size="sm"
            variant="outline"
            class="gap-2"
            icon={<Download size={14} />}
            data-testid="plan-vs-real-export"
            onClick={() => void downloadPlanVsRealCsv({ weekFrom: props.weekStart, weekTo: weekEnd() })}
          >
            Descargar CSV
          </Button>
        }
      />

      <Show when={report.loading}>
        <p class="text-sm text-text-muted">Calculando desviaciones…</p>
      </Show>

      <Show when={!report.loading && (report()?.items.length ?? 0) === 0}>
        <p class="py-6 text-center text-sm text-text-muted" data-testid="plan-vs-real-empty">
          Aún no hay días cerrados con resultado real en esta semana.
        </p>
      </Show>

      <Show when={(report()?.items.length ?? 0) > 0}>
        <div class="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span class="text-text-secondary">
            Días comparados: <strong class="text-text-primary dark:text-white">{report()!.summary.days}</strong>
          </span>
          <span class="text-text-secondary">
            Desviación media km:{' '}
            <strong class={deviationClass(report()!.summary.avgDistanceDeviationPct)}>
              {formatPct(report()!.summary.avgDistanceDeviationPct)}
            </strong>
          </span>
          <span class="text-text-secondary">
            Cumplimiento medio:{' '}
            <strong class="text-text-primary dark:text-white">
              {formatPct(report()!.summary.avgCompletionPct)}
            </strong>
          </span>
          <span class="text-text-secondary">
            Días con incidencia:{' '}
            <strong class="text-text-primary dark:text-white">{report()!.summary.daysWithIncidents}</strong>
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-180 text-sm" data-testid="plan-vs-real-table">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="px-2 py-2 font-semibold">Día</th>
                <th class="px-2 py-2 text-right font-semibold">Previsto km</th>
                <th class="px-2 py-2 text-right font-semibold">Real km</th>
                <th class="px-2 py-2 text-right font-semibold">Δ km</th>
                <th class="px-2 py-2 text-right font-semibold">Δ %</th>
                <th class="px-2 py-2 text-right font-semibold">Puntos</th>
                <th class="px-2 py-2 text-right font-semibold">Cumpl.</th>
                <th class="px-2 py-2 font-semibold">Causa</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border dark:divide-dark-border">
              <For each={report()!.items}>
                {(row) => (
                  <tr data-testid={`plan-vs-real-row-${row.operationDate}`}>
                    <td class="px-2 py-2 font-medium text-text-primary dark:text-white">
                      {formatWeekdayLabel(isoWeekdayMon0(row.operationDate))}
                      <span class="ml-2 text-xs font-normal text-text-muted">{row.operationDate}</span>
                    </td>
                    <td class="px-2 py-2 text-right text-text-secondary">{formatKm(row.plannedDistanceKm)}</td>
                    <td class="px-2 py-2 text-right text-text-secondary">{formatKm(row.actualDistanceKm)}</td>
                    <td class="px-2 py-2 text-right text-text-secondary">{formatDelta(row.distanceDeviationKm)}</td>
                    <td class={`px-2 py-2 text-right font-semibold ${deviationClass(row.distanceDeviationPct)}`}>
                      {formatPct(row.distanceDeviationPct)}
                    </td>
                    <td class="px-2 py-2 text-right text-text-secondary">
                      {row.servedPoints ?? '—'}/{row.scheduledPoints ?? '—'}
                    </td>
                    <td class="px-2 py-2 text-right text-text-secondary">{formatPct(row.completionPct)}</td>
                    <td class="px-2 py-2">
                      <span class="text-text-secondary">{causeLabel(row.cause)}</span>
                      <Show when={row.incidents.length > 0}>
                        <span class="ml-2 text-xs text-text-muted">
                          {row.incidents
                            .map((incident) => `${incident.incidentType} · ${incident.vehicleId}`)
                            .join('; ')}
                        </span>
                      </Show>
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
