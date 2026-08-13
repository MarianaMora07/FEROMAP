import { Match, Show, Switch, createEffect, createSignal } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { Card, LoadingPanel } from '../../../design-system/components';
import { mondayIso } from '../../../core/api/planning';
import {
  fetchPlanningHistory,
  type PlanningHistoryResponse,
} from '../../../core/api/planningHistory';
import { mondayOfDate } from '../../../core/planning/dailyPlanningUx';
import { planningHistoryHref } from '../../../core/planning/planningHistoryLinks';
import { PlanningLevelBanner } from '../PlanningLevelBanner';
import { ThesisVsOperationsNotice } from '../ThesisVsOperationsNotice';
import { PlanningHistoryFilters, type HistoryFilterValues } from './PlanningHistoryFilters';
import { PlanningHistoryWeekView } from './PlanningHistoryWeekView';
import { PlanningHistoryDayView } from './PlanningHistoryDayView';
import { PlanningHistoryIncidentView } from './PlanningHistoryIncidentView';
import { PlanningEmptyState } from '../PlanningEmptyState';
import { PLANNING_EMPTY_PRESETS } from '../../../core/planning/planningEmptyStates';

function parseFilters(params: Record<string, string | string[] | undefined>): HistoryFilterValues {
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  };
  return {
    weekStart: pick('weekStart'),
    operationDate: pick('operationDate'),
    incidentId: pick('incidentId'),
  };
}

async function loadHistory(
  mode: 'week' | 'day' | 'incident',
  values: HistoryFilterValues,
): Promise<PlanningHistoryResponse> {
  if (mode === 'incident') {
    const id = Number(values.incidentId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Indica un número de incidencia válido');
    }
    return fetchPlanningHistory({ incidentId: id });
  }
  if (mode === 'day') {
    if (!values.operationDate) {
      throw new Error('Indica una fecha de operación');
    }
    return fetchPlanningHistory({ operationDate: values.operationDate });
  }
  const weekStart = values.weekStart || mondayIso();
  return fetchPlanningHistory({ weekStart });
}

function resolveMode(values: HistoryFilterValues): 'week' | 'day' | 'incident' {
  if (values.incidentId) return 'incident';
  if (values.operationDate) return 'day';
  return 'week';
}

export default function PlanningHistoryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [filters, setFilters] = createSignal<HistoryFilterValues>({
    weekStart: '',
    operationDate: '',
    incidentId: '',
  });
  const [result, setResult] = createSignal<PlanningHistoryResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    const parsed = parseFilters(searchParams);
    setFilters(parsed);
    const mode = resolveMode(parsed);
    const values =
      mode === 'week' && !parsed.weekStart
        ? { ...parsed, weekStart: mondayIso() }
        : parsed;

    setLoading(true);
    setError(null);
    void loadHistory(mode, values)
      .then((response) => setResult(response))
      .catch((err) => {
        setResult(null);
        setError(err instanceof Error ? err.message : 'No se pudo cargar el historial');
      })
      .finally(() => setLoading(false));
  });

  const applySearch = (mode: 'week' | 'day' | 'incident', values: HistoryFilterValues) => {
    if (mode === 'incident') {
      const id = Number(values.incidentId);
      if (!Number.isFinite(id) || id <= 0) {
        setError('Indica un número de incidencia válido');
        return;
      }
      navigate(planningHistoryHref({ incidentId: id }), { replace: true });
      return;
    }
    if (mode === 'day') {
      if (!values.operationDate) {
        setError('Indica una fecha de operación');
        return;
      }
      navigate(planningHistoryHref({ operationDate: values.operationDate }), { replace: true });
      return;
    }
    navigate(planningHistoryHref({ weekStart: values.weekStart || mondayIso() }), { replace: true });
  };

  const weekStartForView = () => {
    const fromUrl = filters().weekStart;
    if (fromUrl) return mondayOfDate(fromUrl);
    if (result()?.type === 'weekly' && result()!.data.items[0]) {
      return result()!.data.items[0]!.weekStartDate;
    }
    return mondayIso();
  };

  return (
    <div class="space-y-5">
      <PlanningLevelBanner level="administrativo" title="Historial unificado de planificación">
        <p class="text-sm text-text-secondary">
          Busca por semana, día o incidencia en un solo lugar — simulación y operación siguen separados en sus módulos.
        </p>
      </PlanningLevelBanner>

      <ThesisVsOperationsNotice variant="operations" />

      <PlanningHistoryFilters
        values={filters()}
        loading={loading()}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onSearchWeek={() => applySearch('week', filters())}
        onSearchDay={() => applySearch('day', filters())}
        onSearchIncident={() => applySearch('incident', filters())}
        onClear={() => navigate('/planning/history', { replace: true })}
      />

      <Show when={loading()}>
        <Card>
          <LoadingPanel label="Consultando historial…" indeterminate />
        </Card>
      </Show>

      <Show when={error()}>
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error()}</div>
      </Show>

      <Show when={!loading() && result()}>
        {(response) => (
          <Switch fallback={null}>
            <Match when={response().type === 'weekly'}>
              <PlanningHistoryWeekView
                data={(response() as Extract<PlanningHistoryResponse, { type: 'weekly' }>).data}
                weekStart={weekStartForView()}
              />
            </Match>
            <Match when={response().type === 'daily'}>
              <PlanningHistoryDayView
                plan={(response() as Extract<PlanningHistoryResponse, { type: 'daily' }>).data}
                operationalRuns={
                  (response() as Extract<PlanningHistoryResponse, { type: 'daily' }>).operationalRuns
                }
              />
            </Match>
            <Match when={response().type === 'incident_trace'}>
              <PlanningHistoryIncidentView
                trace={(response() as Extract<PlanningHistoryResponse, { type: 'incident_trace' }>).data}
              />
            </Match>
          </Switch>
        )}
      </Show>

      <Show when={!loading() && !result() && !error()}>
        <Card>
          <PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noHistory} />
        </Card>
      </Show>
    </div>
  );
}
