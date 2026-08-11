import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, BarChart3, Download, Eye, FileText } from 'lucide-solid';
import { Badge, Card, CardHeader } from '../../design-system/components';
import { downloadReport } from '../../core/api/reports';
import { simulationState } from '../../core/stores/simulationStore';
import { analyticsHref, reportsHref } from '../../core/utils/simulationLinks';

interface SimulationHistoryPanelProps {
  error: string | null;
  isLoading?: boolean;
  onView: (simulationId: number) => void;
}

export function SimulationHistoryPanel(props: SimulationHistoryPanelProps) {
  return (
    <Card>
      <CardHeader
        title="Historial de simulaciones"
        subtitle="Escenarios de tesis ejecutados y sus resultados"
      />
      <Show when={props.error}>
        <p class="mb-3 text-sm text-red-600">{props.error}</p>
      </Show>
      <Show
        when={simulationState.history.length > 0}
        fallback={<p class="py-8 text-center text-sm text-text-muted">Aún no hay simulaciones registradas.</p>}
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-140 text-sm">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="pb-2 pr-3 font-semibold">Escenario</th>
                <th class="pb-2 pr-3 font-semibold">Fecha</th>
                <th class="pb-2 pr-3 font-semibold">Tipo</th>
                <th class="pb-2 pr-3 font-semibold">Resultado</th>
                <th class="pb-2 pr-3 font-semibold">Ahorro</th>
                <th class="pb-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border dark:divide-dark-border">
              <For each={simulationState.history}>
                {(row) => (
                  <tr>
                    <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">{row.name}</td>
                    <td class="py-2.5 pr-3 text-xs text-text-muted">{row.datetime}</td>
                    <td class="py-2.5 pr-3 text-xs text-text-secondary">
                      {row.contingency ? 'Contingencia' : 'Simulación'}
                    </td>
                    <td class="py-2.5 pr-3">
                      <Badge variant="success" dot>
                        Completado
                      </Badge>
                    </td>
                    <td class="py-2.5 pr-3 font-semibold text-text-primary dark:text-white">
                      {row.efficiency > 0 ? `${row.efficiency}%` : '—'}
                    </td>
                    <td class="py-2.5">
                      <div class="flex items-center gap-0.5">
                        <button
                          type="button"
                          class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue disabled:opacity-50"
                          aria-label={`Ver simulación #${row.id}`}
                          title="Ver resultados"
                          disabled={props.isLoading}
                          onClick={() => props.onView(row.id)}
                        >
                          <Eye size={14} />
                        </button>
                        <A
                          href={analyticsHref(row.id)}
                          class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                          aria-label={`Analítica de simulación #${row.id}`}
                          title="Ver en analítica"
                        >
                          <BarChart3 size={14} />
                        </A>
                        <A
                          href={reportsHref(row.id)}
                          class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                          aria-label={`Reportes de simulación #${row.id}`}
                          title="Ir a reportes"
                        >
                          <FileText size={14} />
                        </A>
                        <button
                          type="button"
                          class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                          aria-label="Descargar reporte CSV"
                          title="Exportar simulaciones (CSV)"
                          onClick={() => void downloadReport('csv')}
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <A
        href="/reports"
        class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
      >
        Ver todos los reportes
        <ArrowRight size={14} />
      </A>
    </Card>
  );
}
