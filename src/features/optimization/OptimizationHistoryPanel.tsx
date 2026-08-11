import { For, Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { Download, Eye, Radio, Search } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import type { OperationalHistoryRow } from '../../core/utils/operationalHistory';
import { planningHistoryHref } from '../../core/planning/planningHistoryLinks';
import {
  loadOptimizationFromHistory,
  optimizationState,
} from '../../core/stores/optimizationStore';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { ThesisVsOperationsNotice } from '../planning/ThesisVsOperationsNotice';

interface OptimizationHistoryPanelProps {
  onViewDay: (operationDate: string) => void;
}

export function OptimizationHistoryPanel(props: OptimizationHistoryPanelProps) {
  const [error, setError] = createSignal<string | null>(null);
  const [downloadingId, setDownloadingId] = createSignal<number | null>(null);

  const rows = () => optimizationState.history as OperationalHistoryRow[];

  const handleLoad = async (row: OperationalHistoryRow) => {
    setError(null);
    try {
      if (row.operationDate) {
        props.onViewDay(row.operationDate);
        return;
      }
      await loadOptimizationFromHistory(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la optimización');
    }
  };

  const handleDownload = async (row: OperationalHistoryRow) => {
    if (!row.dailyPlanId) return;
    setDownloadingId(row.dailyPlanId);
    try {
      const blob = await downloadDailyPlanPdf(row.dailyPlanId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `plan-diario-${row.operationDate ?? row.dailyPlanId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Historial operativo"
        subtitle="Corridas del plan del día"
        action={
          <A href="/planning/history">
            <Button size="sm" variant="outline" class="gap-1" icon={<Search size={14} />}>
              Historial unificado
            </Button>
          </A>
        }
      />
      <ThesisVsOperationsNotice variant="operations" class="mb-4" />
      <Show when={error()}>
        <p class="mb-3 text-sm text-red-500">{error()}</p>
      </Show>
      <Show
        when={rows().length > 0}
        fallback={
          <p class="py-8 text-center text-sm text-text-muted">
            Aún no hay optimizaciones operativas. Genera una ruta en la pestaña «Nueva optimización».
          </p>
        }
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-[36rem] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="pb-2 pr-3 font-semibold">Fecha</th>
                <th class="pb-2 pr-3 font-semibold">Puntos</th>
                <th class="pb-2 pr-3 font-semibold">Km</th>
                <th class="pb-2 pr-3 font-semibold">Estado</th>
                <th class="pb-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border dark:divide-dark-border">
              <For each={rows()}>
                {(row) => (
                  <tr>
                    <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">
                      {row.operationDate ?? row.datetime?.slice(0, 10) ?? '—'}
                    </td>
                    <td class="py-2.5 pr-3 text-text-secondary">{row.pointCount ?? '—'}</td>
                    <td class="py-2.5 pr-3 text-text-secondary">
                      {row.distanceKm != null ? `${row.distanceKm.toFixed(1)} km` : '—'}
                    </td>
                    <td class="py-2.5 pr-3">
                      <PlanningStatusBadge status={row.status ?? 'draft'} />
                    </td>
                    <td class="py-2.5">
                      <div class="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          class="gap-1"
                          icon={<Eye size={13} />}
                          onClick={() => void handleLoad(row)}
                        >
                          Ver día
                        </Button>
                        <Show when={row.operationDate}>
                          <A href={planningHistoryHref({ operationDate: row.operationDate })}>
                            <Button size="sm" variant="outline" class="gap-1" icon={<Search size={13} />}>
                              Historial
                            </Button>
                          </A>
                        </Show>
                        <Show when={row.status === 'dispatched'}>
                          <A href="/monitoring">
                            <Button size="sm" variant="outline" class="gap-1" icon={<Radio size={13} />}>
                              Ver en monitoreo
                            </Button>
                          </A>
                        </Show>
                        <Show when={row.dailyPlanId}>
                          <Button
                            size="sm"
                            variant="outline"
                            class="gap-1"
                            icon={<Download size={13} />}
                            loading={downloadingId() === row.dailyPlanId}
                            onClick={() => void handleDownload(row)}
                          >
                            PDF del día
                          </Button>
                        </Show>
                      </div>
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
