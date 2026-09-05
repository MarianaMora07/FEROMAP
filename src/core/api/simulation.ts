import type { RouteCollection } from '../../data/types/geo';
import type { KpiMetrics, Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import { kpiByScenario, optimizationLogMessages, scenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { apiDownload, apiGet, useMocks } from './client';
import { mergeRouteCollections } from './routes';
import {
  fetchSimulationOptimizeJob,
  startSimulationOptimizeJob,
  type OptimizeJobResult,
} from './simulationJobs';

export type OptimizeResponse = OptimizeJobResult & {
  scenario?: Scenario;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOptimizeJob(jobId: string, signal?: AbortSignal): Promise<OptimizeJobResult> {
  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const snapshot = await fetchSimulationOptimizeJob(jobId);
    if (snapshot.status === 'completed' && snapshot.result) {
      return snapshot.result;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'La optimización falló en el servidor');
    }
    if (snapshot.status === 'cancelled') {
      throw new DOMException('Aborted', 'AbortError');
    }
    await delay(450);
  }
}

function mockOptimizeResponse(scenarioId: ScenarioId): OptimizeResponse {
  const routes = getScenarioRoutes(scenarioId);
  return {
    simulationId: 0,
    scenarioId,
    scenario: scenarios.find((s) => s.id === scenarioId)!,
    kpis: kpiByScenario[scenarioId],
    routes: {
      current: {
        type: 'FeatureCollection',
        features: routes.features.filter((f) => f.properties.type === 'current'),
      },
      optimized: {
        type: 'FeatureCollection',
        features: routes.features.filter((f) => f.properties.type === 'optimized'),
      },
    },
    logs: optimizationLogMessages.map((entry, index) => ({
      id: `log-mock-${index}`,
      timestamp: new Date().toLocaleTimeString('es-VE'),
      message: entry.message,
      type: entry.type,
    })),
  };
}

export function fetchScenarios(): Promise<Scenario[]> {
  if (useMocks) return Promise.resolve(scenarios);
  return apiGet<Scenario[]>('/api/v1/scenarios');
}

export function fetchKpis(scenarioId: ScenarioId): Promise<KpiMetrics> {
  if (useMocks) return Promise.resolve(kpiByScenario[scenarioId]);
  return apiGet<KpiMetrics>(`/api/v1/kpis?scenario=${scenarioId}`);
}

export interface SimulationRunParameters {
  rainIntensity?: string;
  wasteLevelPct?: number;
  estimatedDurationHours?: number;
  /** Operarios de campo ausentes en el turno (0–5). ADR-003. */
  operatorsShortage?: number;
  /** Hormigas por iteración del ACO (4–30). */
  acoAnts?: number;
  /** Iteraciones del ACO (5–60). */
  acoIterations?: number;
  /** Hora de salida de la flota (0–23) para la franja de congestión (Tarea 4). */
  departureHour?: number;
  /** Caso de estudio acotado (Fase 12.3). */
  caseStudyId?: number;
}

export async function runSimulationOptimize(
  scenarioId: ScenarioId,
  parameters?: SimulationRunParameters,
  signal?: AbortSignal,
): Promise<OptimizeResponse> {
  if (useMocks) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 1200);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    return {
      ...mockOptimizeResponse(scenarioId),
      scenario: scenarios.find((s) => s.id === scenarioId)!,
    };
  }
  const { jobId } = await startSimulationOptimizeJob(scenarioId, parameters);
  const result = await waitForOptimizeJob(jobId, signal);
  return {
    ...result,
    scenario: scenarios.find((s) => s.id === result.scenarioId),
  };
}

export async function fetchSimulationRoutes(scenarioId: ScenarioId): Promise<RouteCollection> {
  const result = await runSimulationOptimize(scenarioId);
  return mergeRouteCollections(result.routes.current, result.routes.optimized);
}

// --- Comparativa multi-corrida y export por corrida (Tarea 5) ---------------

export interface SimulationComparisonRow {
  id: number;
  executedAt: string | null;
  date: string | null;
  scenarioId: string;
  label: string;
  distanceHistoricalKm: number;
  distanceOptimizedKm: number;
  durationHoursOptimized: number | null;
  co2KgAvoided: number | null;
  savingPct: number;
  containersServed?: number;
  caseStudyId?: number | null;
  caseStudyCode?: string | null;
  caseStudyName?: string | null;
  contingency?: boolean;
}

export interface SimulationComparisonsOptions {
  fromDate?: string;
  toDate?: string;
  scenarioId?: string;
  caseStudyId?: number;
}

function comparisonsQuery(options: SimulationComparisonsOptions): string {
  const params = new URLSearchParams();
  if (options.fromDate) params.set('fromDate', options.fromDate);
  if (options.toDate) params.set('toDate', options.toDate);
  if (options.scenarioId) params.set('scenarioId', options.scenarioId);
  if (options.caseStudyId != null) params.set('caseStudyId', String(options.caseStudyId));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchSimulationComparisons(
  options?: SimulationComparisonsOptions,
): Promise<SimulationComparisonRow[]> {
  if (useMocks) return mockSimulationComparisons();
  const payload = await apiGet<{ items: SimulationComparisonRow[]; count: number }>(
    `/api/v1/simulations/comparisons${comparisonsQuery(options ?? {})}`,
  );
  return payload.items;
}

export function downloadSimulationExport(format: 'csv' | 'pdf', simulationId: number): Promise<void> {
  const ext = format === 'pdf' ? 'pdf' : 'csv';
  return apiDownload(
    `/api/v1/simulations/${simulationId}/export?format=${format}`,
    `feromap-simulacion-${simulationId}.${ext}`,
  );
}

export function downloadSimulationRoutesGeoJSON(simulationId: number): Promise<void> {
  return apiDownload(
    `/api/v1/simulations/${simulationId}/routes.geojson`,
    `feromap-simulacion-${simulationId}-rutas.geojson`,
  );
}

function mockSimulationComparisons(): SimulationComparisonRow[] {
  const daysAgo = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return date.toISOString();
  };
  const scenario = (id: string): Scenario => scenarios.find((item) => item.id === id) ?? scenarios[0]!;
  const raw: Array<[number, number, number, number]> = [
    // (historical, optimized, saving, daysAgo)
    [96.0, 88.0, 8.3, 6],
    [101.0, 87.0, 13.9, 4],
    [98.0, 79.0, 19.4, 2],
    [103.0, 76.0, 26.2, 0],
  ];
  return raw.map(([historical, optimized, saving, offset], index) => {
    const item = scenario(index % 2 === 0 ? 'normal' : 'rain');
    const executedAt = daysAgo(offset);
    return {
      id: 200 + index,
      executedAt,
      date: executedAt.slice(0, 10),
      scenarioId: item.id,
      label: item.label,
      distanceHistoricalKm: historical,
      distanceOptimizedKm: optimized,
      durationHoursOptimized: 6.5 - index * 0.4,
      co2KgAvoided: 9.0 + index * 3.5,
      savingPct: saving,
      containersServed: 60,
      contingency: false,
    };
  });
}
