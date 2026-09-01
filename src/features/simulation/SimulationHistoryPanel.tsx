import { For, Show, createEffect, createResource, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, BarChart3, Download, Eye, FileText } from 'lucide-solid';
import { Card, CardHeader, SelectField, Badge } from '../../design-system/components';
import { downloadReport } from '../../core/api/reports';
import { fetchCaseStudies } from '../../core/api/caseStudies';
import { refreshSimulationHistory, simulationState } from '../../core/stores/simulationStore';
import { analyticsHref, reportsHref } from '../../core/utils/simulationLinks';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

export type SimulationHistoryFilter = 'all' | 'legacy' | number;

interface SimulationHistoryPanelProps {
  error: string | null;
  isLoading?: boolean;
  onView: (simulationId: number) => void;
}

function resolveFilterParams(filter: SimulationHistoryFilter): {
  caseStudyId?: number;
  legacyOnly?: boolean;
} {
  if (filter === 'legacy') return { legacyOnly: true };
  if (typeof filter === 'number') return { caseStudyId: filter };
  return {};
}

export function SimulationHistoryPanel(props: SimulationHistoryPanelProps) {
  const [filter, setFilter] = createSignal<SimulationHistoryFilter>('all');
  const [cases] = createResource(() => fetchCaseStudies({ limit: 100 }).then((response) => response.items));

  createEffect(() => {
    void refreshSimulationHistory(resolveFilterParams(filter()));
  });

  const handleFilterChange = (event: Event) => {
    const raw = (event.currentTarget as HTMLSelectElement).value;
    if (raw === 'all') setFilter('all');
    else if (raw === 'legacy') setFilter('legacy');
    else setFilter(Number(raw));
  };

  const filterSelectValue = () => {
    const current = filter();
    if (current === 'all') return 'all';
    if (current === 'legacy') return 'legacy';
    return String(current);
  };

  return (
    <Card>
      <CardHeader
        title="Historial de simulaciones"
        subtitle="Escenarios de simulación ejecutados — no incluye planes operativos del día"
      />
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <div class="min-w-[240px] flex-1">
          <SelectField label="Filtrar por caso" value={filterSelectValue()} onChange={handleFilterChange}>
            <option value="all">Todos los registros</option>
            <option value="legacy">Solo modo legacy (sin caso)</option>
            <For each={cases() ?? []}>
              {(item) => <option value={item.id}>{item.code}</option>}
            </For>
          </SelectField>
        </div>
        <p class="pb-3 text-xs text-text-muted">{simulationState.history.length} resultado(s)</p>
      </div>
      <Show when={props.error}>
        <p class="mb-3 text-sm text-red-600">{props.error}</p>
      </Show>
      <Show
        when={simulationState.history.length > 0}
        fallback={
          <p class="py-8 text-center text-sm text-text-muted">
            No hay simulaciones para el filtro seleccionado.
          </p>
        }
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-140 text-sm">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="pb-2 pr-3 font-semibold">Escenario</th>
                <th class="pb-2 pr-3 font-semibold">Caso</th>
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
                    <td class="py-2.5 pr-3">
                      <Show
                        when={row.caseStudyCode}
                        fallback={<Badge variant="default">Legacy</Badge>}
                      >
                        {(code) => (
                          <Badge variant="success" title={row.caseStudyName ?? undefined}>
                            Caso: {code()}
                          </Badge>
                        )}
                      </Show>
                    </td>
                    <td class="py-2.5 pr-3 text-xs text-text-muted">{row.datetime}</td>
                    <td class="py-2.5 pr-3 text-xs text-text-secondary">
                      {row.contingency ? 'Contingencia' : 'Simulación'}
                    </td>
                    <td class="py-2.5 pr-3">
                      <PlanningStatusBadge status="completed" />
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
                          title="Ver resultados y playback"
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
