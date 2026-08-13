import { apiGet, apiPatch, apiPost, useMocks } from './client';
import type { ScenarioId } from '../../data/types/simulation';

export interface WeeklyPlanDay {
  id?: number;
  operationDate: string;
  weekday: number;
  sectorIds: number[];
  collectionPointIds: number[];
  expectedVehicleCount?: number | null;
  scenarioIdOverride?: string | null;
  status?: string;
}

export interface PlanVersion {
  id: number;
  entityType: string;
  entityId: number;
  versionNumber: number;
  changeSummary?: string | null;
  createdAt?: string | null;
  snapshot: Record<string, unknown>;
}

export interface VersionDiffChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface WeeklyPlan {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  scenarioId: ScenarioId;
  referenceSimulationId?: number | null;
  expectedKpis?: Record<string, unknown> | null;
  notes?: string | null;
  approvedAt?: string | null;
  days: WeeklyPlanDay[];
}

export interface PendingVisit {
  id: number;
  collectionPointId: number;
  code?: string | null;
  originOperationDate: string;
  targetOperationDate?: string | null;
  reason: string;
  status: string;
  priority: number;
}

export interface DailyPlan {
  id: number;
  operationDate: string;
  status: string;
  scenarioId: ScenarioId;
  weeklyPlanId?: number | null;
  simulationId?: number | null;
  scheduledPoints: Array<{ id: number; code: string; sectorName?: string | null }>;
  pendingPoints: PendingVisit[];
  pendingPointIds: number[];
  finalPointIds: number[];
  dispatchedAt?: string | null;
  closedAt?: string | null;
  notes?: string | null;
}

export interface DailyCloseResult {
  closedAt: string;
  newPendingVisits: number;
  status: string;
}

function mondayIso(value = new Date()): string {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export { mondayIso };

export function addWeeksToMonday(weekStartIso: string, weeks: number): string {
  const date = new Date(weekStartIso);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export function isPastWeek(weekStartDate: string, reference = new Date()): boolean {
  return weekStartDate < mondayIso(reference);
}

export function isCurrentWeek(weekStartDate: string, reference = new Date()): boolean {
  return weekStartDate === mondayIso(reference);
}

function mockWeeklyPlan(): WeeklyPlan {
  const start = mondayIso();
  const days: WeeklyPlanDay[] = [];
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    days.push({
      operationDate: date.toISOString().slice(0, 10),
      weekday: date.getDay() === 0 ? 6 : date.getDay() - 1,
      sectorIds: [],
      collectionPointIds: [1 + offset, 2 + offset, 3 + offset],
      status: 'planned',
    });
  }
  return {
    id: 1,
    weekStartDate: start,
    weekEndDate: days[4]!.operationDate,
    status: 'approved',
    scenarioId: 'normal',
    days,
  };
}

function mockDailyPlan(operationDate: string): DailyPlan {
  const demoClosed =
    typeof localStorage !== 'undefined' && localStorage.getItem('feromap.demo.operatorClosedDay') === '1';
  return {
    id: 1,
    operationDate,
    status: demoClosed ? 'partial' : 'dispatched',
    dispatchedAt: `${operationDate}T06:00:00.000Z`,
    closedAt: demoClosed ? `${operationDate}T18:30:00.000Z` : null,
    scenarioId: 'normal',
    weeklyPlanId: 1,
    scheduledPoints: [
      { id: 1, code: 'CNT-001' },
      { id: 2, code: 'CNT-002' },
    ],
    pendingPoints: [
      {
        id: 1,
        collectionPointId: 16,
        code: 'CNT-016',
        originOperationDate: operationDate,
        reason: 'not_visited',
        status: 'open',
        priority: 100,
      },
    ],
    pendingPointIds: [16],
    finalPointIds: [1, 2, 16],
  };
}

export function fetchWeeklyPlans(): Promise<{ items: WeeklyPlan[]; count: number }> {
  if (useMocks) {
    const current = mondayIso();
    const prev = addWeeksToMonday(current, -1);
    const next = addWeeksToMonday(current, 1);
    const nextEnd = new Date(next);
    nextEnd.setDate(nextEnd.getDate() + 4);
    return Promise.resolve({
      items: [
        {
          ...mockWeeklyPlan(),
          id: 3,
          weekStartDate: next,
          weekEndDate: nextEnd.toISOString().slice(0, 10),
          status: 'draft',
          days: [],
        },
        { ...mockWeeklyPlan(), id: 1, weekStartDate: current, status: 'approved' },
        {
          ...mockWeeklyPlan(),
          id: 2,
          weekStartDate: prev,
          status: 'approved',
        },
      ],
      count: 3,
    });
  }
  return apiGet('/api/v1/planning/weekly');
}

export function fetchWeeklyPlanById(planId: number): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve({ ...mockWeeklyPlan(), id: planId });
  return apiGet(`/api/v1/planning/weekly/${planId}`);
}

export function archiveWeeklyPlan(planId: number): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve({ ...mockWeeklyPlan(), id: planId, status: 'archived' });
  return apiPost(`/api/v1/planning/weekly/${planId}/archive`, {});
}

export function fetchCurrentWeeklyPlan(referenceDate?: string): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve(mockWeeklyPlan());
  const query = referenceDate ? `?reference=${referenceDate}` : '';
  return apiGet(`/api/v1/planning/weekly/current${query}`);
}

export interface DailyPlanSummary {
  id: number;
  operationDate: string;
  status: string;
  scenarioId: ScenarioId;
  simulationId?: number | null;
}

export function fetchDailyPlansInRange(
  fromDate: string,
  toDate: string,
): Promise<{ items: DailyPlanSummary[] }> {
  if (useMocks) {
    const items: DailyPlanSummary[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const statuses = ['draft', 'optimized', 'dispatched', 'completed', 'draft', 'none', 'none'] as const;
    let index = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const operationDate = cursor.toISOString().slice(0, 10);
      const status = statuses[index % statuses.length];
      if (status !== 'none') {
        items.push({
          id: index + 1,
          operationDate,
          status,
          scenarioId: 'normal',
          simulationId: status === 'draft' ? null : 1,
        });
      }
      index += 1;
    }
    return Promise.resolve({ items });
  }
  return apiGet(`/api/v1/planning/daily?from=${fromDate}&to=${toDate}`);
}

export function createWeeklyPlan(payload: {
  weekStartDate: string;
  scenarioId: ScenarioId;
  days: Array<{ operationDate: string; collectionPointIds: number[] }>;
  notes?: string;
}): Promise<WeeklyPlan> {
  if (useMocks) {
    return Promise.resolve({
      ...mockWeeklyPlan(),
      status: 'draft',
      weekStartDate: payload.weekStartDate,
      days: payload.days.map((day, index) => ({
        operationDate: day.operationDate,
        weekday: new Date(day.operationDate).getDay(),
        sectorIds: [],
        collectionPointIds: day.collectionPointIds,
        id: index + 1,
      })),
    });
  }
  return apiPost('/api/v1/planning/weekly', payload);
}

export function updateWeeklyPlan(
  planId: number,
  payload: { scenarioId?: ScenarioId; days?: WeeklyPlanDay[]; notes?: string },
): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve(mockWeeklyPlan());
  return apiPatch(`/api/v1/planning/weekly/${planId}`, payload);
}

export function validateWeeklyPlan(planId: number): Promise<{ jobId: string; weeklyPlanId: number }> {
  if (useMocks) return Promise.resolve({ jobId: 'mock-job', weeklyPlanId: planId });
  return apiPost(`/api/v1/planning/weekly/${planId}/validate`, {});
}

export function approveWeeklyPlan(
  planId: number,
  payload?: { referenceSimulationId?: number; expectedKpis?: Record<string, unknown> },
): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve({ ...mockWeeklyPlan(), status: 'approved' });
  return apiPost(`/api/v1/planning/weekly/${planId}/approve`, payload ?? {});
}

export function fetchDailyPlan(operationDate: string): Promise<DailyPlan> {
  if (useMocks) return Promise.resolve(mockDailyPlan(operationDate));
  return apiGet(`/api/v1/planning/daily/${operationDate}`);
}

export function openDailyPlan(operationDate: string): Promise<DailyPlan> {
  if (useMocks) return Promise.resolve(mockDailyPlan(operationDate));
  return apiPost(`/api/v1/planning/daily/${operationDate}/open`, {});
}

export function optimizeDailyPlan(dailyPlanId: number): Promise<{ jobId: string; dailyPlanId: number; pointCount: number }> {
  if (useMocks) return Promise.resolve({ jobId: 'mock-job', dailyPlanId, pointCount: 3 });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/optimize`, {});
}

export function dispatchDailyPlan(dailyPlanId: number): Promise<{ dispatchedRouteIds: number[]; count: number }> {
  if (useMocks) return Promise.resolve({ dispatchedRouteIds: [1, 2], count: 2 });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/dispatch`, {});
}

export function closeDailyPlan(dailyPlanId: number): Promise<DailyCloseResult> {
  if (useMocks) return Promise.resolve({ closedAt: new Date().toISOString(), newPendingVisits: 2, status: 'partial' });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/close`, {});
}

export function fetchPendingVisits(params?: {
  status?: string;
  targetDate?: string;
  originFrom?: string;
  originTo?: string;
}): Promise<{ items: PendingVisit[] }> {
  if (useMocks) {
    return Promise.resolve({
      items: mockDailyPlan(params?.targetDate ?? new Date().toISOString().slice(0, 10)).pendingPoints,
    });
  }
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.targetDate) search.set('targetDate', params.targetDate);
  if (params?.originFrom) search.set('originFrom', params.originFrom);
  if (params?.originTo) search.set('originTo', params.originTo);
  const query = search.toString();
  return apiGet(`/api/v1/planning/pending${query ? `?${query}` : ''}`);
}

export function autofillWeeklyPlanFromSchedules(planId: number): Promise<WeeklyPlan> {
  if (useMocks) return Promise.resolve(mockWeeklyPlan());
  return apiPost(`/api/v1/planning/weekly/${planId}/autofill-from-schedules`, {});
}

export function fetchWeeklyPlanVersions(planId: number): Promise<{ items: PlanVersion[] }> {
  if (useMocks) {
    return Promise.resolve({
      items: [
        {
          id: 1,
          entityType: 'weekly_plan',
          entityId: planId,
          versionNumber: 1,
          changeSummary: 'Versión inicial',
          snapshot: mockWeeklyPlan() as unknown as Record<string, unknown>,
        },
      ],
    });
  }
  return apiGet(`/api/v1/planning/weekly/${planId}/versions`);
}

export function compareWeeklyPlanVersions(
  planId: number,
  versionA: number,
  versionB: number,
): Promise<{ versionA: number; versionB: number; changes: VersionDiffChange[] }> {
  if (useMocks) return Promise.resolve({ versionA, versionB, changes: [] });
  return apiGet(
    `/api/v1/planning/weekly/${planId}/versions/compare?versionA=${versionA}&versionB=${versionB}`,
  );
}

export function downloadWeeklyPlanPdf(planId: number): Promise<Blob> {
  return fetchWeeklyOrDailyPdf(`/api/v1/planning/weekly/${planId}/export.pdf`);
}

export function downloadDailyPlanPdf(dailyPlanId: number): Promise<Blob> {
  return fetchWeeklyOrDailyPdf(`/api/v1/planning/daily/${dailyPlanId}/export.pdf`);
}

async function fetchWeeklyOrDailyPdf(path: string): Promise<Blob> {
  const { resolveUrl, getAuthToken } = await import('./client');
  const res = await fetch(resolveUrl(path), {
    headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('No se pudo descargar el PDF');
  return res.blob();
}

export function cancelPendingVisit(pendingId: number, reason?: string): Promise<PendingVisit> {
  if (useMocks) {
    return Promise.resolve({
      id: pendingId,
      collectionPointId: 1,
      originOperationDate: new Date().toISOString().slice(0, 10),
      reason: 'cancelled',
      status: 'cancelled',
      priority: 0,
    });
  }
  return apiPost(`/api/v1/planning/pending/${pendingId}/cancel`, { reason });
}
