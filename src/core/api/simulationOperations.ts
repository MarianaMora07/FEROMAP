import type { RouteCollection } from '../types/geo';
import type { KpiMetrics, ScenarioId } from '../../data/types/simulation';
import { simulationHistory } from '../../data/mock/simulationScenarios';
import { kpiByScenario } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { apiGet, apiPost, useMocks } from './client';
import { mergeRouteCollections } from './routes';

export interface SimulationHistoryRow {
  id: number;
  name: string;
  datetime: string;
  efficiency: number;
  scenarioId: ScenarioId;
  contingency: boolean;
  caseStudyId?: number | null;
  caseStudyCode?: string | null;
  caseStudyName?: string | null;
}

export interface SimulationPlanningContext {
  level?: string;
  operationDate?: string | null;
  dailyPlanId?: number | null;
  weeklyPlanId?: number | null;
}

export interface SimulationDetail {
  id: number;
  executedAt: string | null;
  scenarioId: ScenarioId;
  scenarioName: string;
  kpis: KpiMetrics;
  kpiSavingPercentage: number;
  planningContext?: SimulationPlanningContext | null;
  caseStudyId?: number | null;
  caseStudyCode?: string | null;
  caseStudyName?: string | null;
  routes: {
    current: RouteCollection;
    optimized: RouteCollection;
  };
}

function formatSimulationDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mockSimulationDetail(id: number): SimulationDetail {
  const index = Math.max(0, (id - 1) % simulationHistory.length);
  const row = simulationHistory[index]!;
  const scenarioId: ScenarioId =
    index === 0 ? 'rain' : index === 1 ? 'saturated' : index === 2 ? 'peak_traffic' : 'normal';

  const routes = getScenarioRoutes(scenarioId);
  return {
    id,
    executedAt: new Date().toISOString(),
    scenarioId,
    scenarioName: row.name,
    kpis: kpiByScenario[scenarioId],
    kpiSavingPercentage: row.efficiency,
    routes: {
      current: {
        type: 'FeatureCollection',
        features: routes.features.filter((feature) => feature.properties.type === 'current'),
      },
      optimized: {
        type: 'FeatureCollection',
        features: routes.features.filter((feature) => feature.properties.type === 'optimized'),
      },
    },
  };
}

export async function fetchSimulationHistory(options?: {
  caseStudyId?: number;
  legacyOnly?: boolean;
  limit?: number;
}): Promise<SimulationHistoryRow[]> {
  if (useMocks) {
    const rows = simulationHistory.map((row, index) => ({
      id: index + 1,
      name: row.name,
      datetime: row.datetime,
      efficiency: row.efficiency,
      scenarioId:
        (index === 0 ? 'rain' : index === 1 ? 'saturated' : index === 2 ? 'peak_traffic' : 'normal') as ScenarioId,
      contingency: index === 3,
      caseStudyId: index === 0 ? 1 : index === 1 ? 2 : null,
      caseStudyCode: index === 0 ? 'CE-UNARE-NORTE' : index === 1 ? 'CE-UNARE-SUR' : null,
      caseStudyName: index === 0 ? 'Unare Norte' : index === 1 ? 'Unare Sur' : null,
    })) as SimulationHistoryRow[];
    if (options?.legacyOnly) return rows.filter((row) => !row.caseStudyId);
    if (options?.caseStudyId != null) {
      return rows.filter((row) => row.caseStudyId === options.caseStudyId);
    }
    return rows;
  }

  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? 25));
  if (options?.caseStudyId != null) params.set('caseStudyId', String(options.caseStudyId));
  if (options?.legacyOnly) params.set('legacyOnly', 'true');

  const response = await apiGet<{
    items: Array<{
      id: number;
      name: string;
      executedAt: string | null;
      scenarioId: ScenarioId;
      savingPercentage: number;
      contingency: boolean;
      caseStudyId?: number | null;
      caseStudyCode?: string | null;
      caseStudyName?: string | null;
    }>;
  }>(`/api/v1/simulations?${params.toString()}`);

  return response.items.map((row) => ({
    id: row.id,
    name: row.name,
    datetime: formatSimulationDate(row.executedAt),
    efficiency: Math.round(row.savingPercentage),
    scenarioId: row.scenarioId,
    contingency: row.contingency,
    caseStudyId: row.caseStudyId ?? null,
    caseStudyCode: row.caseStudyCode ?? null,
    caseStudyName: row.caseStudyName ?? null,
  }));
}

export function fetchSimulationDetail(id: number): Promise<SimulationDetail> {
  if (useMocks) return Promise.resolve(mockSimulationDetail(id));

  return apiGet<{
    id: number;
    executedAt: string | null;
    scenarioId: ScenarioId;
    scenarioName: string;
    kpis: KpiMetrics;
    kpiSavingPercentage: number;
    caseStudyId?: number | null;
    caseStudyCode?: string | null;
    caseStudyName?: string | null;
    parameters?: { planningContext?: SimulationPlanningContext };
    routes: SimulationDetail['routes'];
  }>(`/api/v1/simulations/${id}`).then((detail) => ({
    id: detail.id,
    executedAt: detail.executedAt,
    scenarioId: detail.scenarioId,
    scenarioName: detail.scenarioName,
    kpis: detail.kpis,
    kpiSavingPercentage: detail.kpiSavingPercentage,
    caseStudyId: detail.caseStudyId ?? null,
    caseStudyCode: detail.caseStudyCode ?? null,
    caseStudyName: detail.caseStudyName ?? null,
    planningContext: detail.parameters?.planningContext ?? null,
    routes: detail.routes,
  }));
}

export interface DispatchRoutesResult {
  dispatchedRouteIds: number[];
  count: number;
}

export function dispatchOptimizedRoutes(dailyPlanId?: number): Promise<DispatchRoutesResult> {
  return apiPost<DispatchRoutesResult>('/api/v1/routes/dispatch', dailyPlanId ? { dailyPlanId } : {});
}
