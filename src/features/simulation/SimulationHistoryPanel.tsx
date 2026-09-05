import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, Download, Eye, FileText } from 'lucide-solid';
import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'solid-chartjs';
import { Card, CardHeader, SelectField, Badge } from '../../design-system/components';
import {
  downloadSimulationExport,
  fetchScenarios,
  fetchSimulationComparisons,
  type SimulationComparisonRow,
} from '../../core/api/simulation';
import { fetchCaseStudies } from '../../core/api/caseStudies';
import { refreshSimulationHistory, simulationState } from '../../core/stores/simulationStore';
import { reportsHref } from '../../core/utils/simulationLinks';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
  chartRegistered = true;
}

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
  const [scenarioFilter, setScenarioFilter] = createSignal<'all' | string>('all');
  const [cases] = createResource(() =>
    fetchCaseStudies({ limit: 100, demoOnly: true }).then((response) => response.items),
  );
  const [scenarioOptions] = createResource(() => fetchScenarios());
  const [comparisons] = createResource<SimulationComparisonRow[]>(() =>
    fetchSimulationComparisons({
      ...resolveFilterParams(filter()),
      scenarioId: scenarioFilter() === 'all' ? undefined : scenarioFilter(),
    }),
  );

  onMount(ensureChart);

  const chartData = createMemo(() => {
    const rows = comparisons() ?? [];
    return {
      labels: rows.map((row) => row.date ?? row.executedAt?.slice(0, 10) ?? String(row.id)),
      datasets: [
        {
          label: 'Ruta actual/histórica (km)',
          data: rows.map((row) => row.distanceHistoricalKm),
          borderColor: '#64748b',
          backgroundColor: '#64748b',
          borderDash: [6, 4],
          tension: 0.2,
          pointRadius: 3,
        },
        {
          label: 'Optimizada por IA (km)',
          data: rows.map((row) => row.distanceOptimizedKm),
          borderColor: '#22c55e',
          backgroundColor: '#22c55e',
          tension: 0.2,
          pointRadius: 3,
        },
        {
          label: 'Ahorro (%)',
          data: rows.map((row) => row.savingPct),
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          yAxisID: 'y1',
          borderDash: [2, 3],
          tension: 0.2,
          pointRadius: 2,
        },
      ],
    };
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      y: { title: { display: true, text: 'Distancia (km)' }, beginAtZero: true },
      y1: {
        position: 'right' as const,
        title: { display: true, text: 'Ahorro (%)' },
        beginAtZero: true,
        grid: { drawOnChartArea: false },
      },
    },
    plugins: { legend: { position: 'bottom' as const } },
  };

  const handleScenarioFilterChange = (event: Event) => {
    setScenarioFilter((event.currentTarget as HTMLSelectElement).value);
  };

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
        <div class="min-w-[200px] flex-1">
          <SelectField
            label="Filtrar por escenario"
            value={scenarioFilter()}
            onChange={handleScenarioFilterChange}
          >
            <option value="all">Todos los escenarios</option>
            <For each={scenarioOptions() ?? []}>
              {(item) => <option value={item.id}>{item.label}</option>}
            </For>
          </SelectField>
        </div>
        <p class="pb-3 text-xs text-text-muted">{simulationState.history.length} resultado(s)</p>
      </div>
      <Show when={props.error}>
        <p class="mb-3 text-sm text-red-600">{props.error}</p>
      </Show>
      <Show when={(comparisons()?.length ?? 0) >= 2}>
        <div class="mb-5">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Comparativa IA vs histórica (acumulada)
          </p>
          <div class="h-64 rounded-lg border border-border p-2 dark:border-dark-border">
            <Line data={chartData()} options={chartOptions} />
          </div>
          <p class="mt-1.5 text-[11px] text-text-muted">
            Nota metodológica: la ruta "actual/histórica" es la línea base sintética (orden por
            código); la "IA" es la optimizada por ACO en cada corrida.
          </p>
        </div>
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
                          aria-label="Descargar corrida (CSV)"
                          title="Exportar esta corrida (CSV)"
                          onClick={() => void downloadSimulationExport('csv', row.id)}
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
