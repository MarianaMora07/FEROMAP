import { apiDelete, apiGet, apiPatch, apiPost, ApiError, useMocks } from './client';
import { idempotencyHeaders } from './idempotency';
import { tomorrowIso } from '../planning/planningUx';
import {
  addWeeksToMonday,
  formatIsoDateLocal,
  mondayIso,
  parseIsoDateLocal,
} from '../planning/isoDate';
import { authUser } from '../stores/authStore';
import { canEnsureDailyPlan } from '../auth/permissions';
import type { ScenarioId } from '../../data/types/simulation';

export { addWeeksToMonday, mondayIso };

export type WeeklyPlanPointSource = 'case_study' | 'manual';

/** Contrato del previsto por el motor para un día (compartido con el backend). */
export interface PlanForecast {
  distanceKm: number;
  durationHours: number;
  baselineDistanceKm?: number | null;
  savingPct?: number | null;
  scheduledPoints: number;
  coveredPoints: number;
  uncoveredPoints: number;
  coveragePct?: number | null;
  vehicleCount: number;
}

/** Previsto agregado de la semana, con desglose por día (`operationDate`). */
export interface WeeklyPlanForecast extends PlanForecast {
  weekStartDate: string;
  days: Record<string, PlanForecast>;
}

/** Cierre del ciclo: previsto vs. ejecutado de un día (compartido con el backend). */
export interface PlanVsReal {
  plannedDistanceKm?: number | null;
  actualDistanceKm?: number | null;
  plannedDurationMin?: number | null;
  actualDurationMin?: number | null;
  scheduledPoints: number;
  servedPoints: number;
  collectedKg: number;
  completionPct?: number | null;
}

/** Pre-flight heurístico por día (demanda estimada vs. capacidad de flota). */
export interface WeeklyPlanPreflightRow {
  operationDate?: string;
  pointCount?: number;
  scenarioId?: string;
  demandKg?: number;
  capacityKg?: number;
  expectedVehicles?: number;
  availableVehicles?: number;
  overloaded?: boolean;
  insufficientFleet?: boolean;
}

export interface WeeklyPlanPreflight {
  feasible: boolean;
  rows: WeeklyPlanPreflightRow[];
  simulation?: {
    feasible?: boolean;
    rows?: Array<{
      operationDate?: string;
      scenarioId?: string;
      distanceKm?: number;
      durationHours?: number;
      coveragePct?: number | null;
      uncoveredPoints?: number | null;
      servedPoints?: number;
      feasible?: boolean;
      skipped?: boolean;
      error?: string;
    }>;
  } | null;
}

export interface WeeklyPlanDay {
  id?: number;
  operationDate: string;
  weekday: number;
  sectorIds: number[];
  collectionPointIds: number[];
  pointSource?: WeeklyPlanPointSource;
  caseStudyId?: number | null;
  caseStudyCode?: string | null;
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

export interface WeeklyPlanDayRoute {
  vehicleCode: string;
  driverName?: string | null;
  distanceKm: number;
  durationMin: number;
  stops: number;
}

export interface WeeklyPlanDayOperational {
  operationDate: string;
  weekday: number;
  status: string;
  dailyPlanId?: number | null;
  simulationId?: number | null;
  pointCount?: number;
  servedPoints?: number;
  uncoveredPoints?: number;
  distanceKm?: number;
  durationHours?: number;
  vehicles: WeeklyPlanDayRoute[];
  error?: string | null;
}

export interface WeeklyOperationalPlan {
  generatedAt: string;
  weekStartDate: string;
  fleetByType?: Record<string, number> | null;
  days: WeeklyPlanDayOperational[];
}

export interface WeeklyPlan {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  scenarioId: ScenarioId;
  caseStudyId?: number | null;
  caseStudyCode?: string | null;
  caseStudyName?: string | null;
  referenceSimulationId?: number | null;
  /** Composición de flota de la semana por tipo (ej. { Compactadora: 3, Volteo: 1 }). */
  fleetByType?: Record<string, number> | null;
  /** Resumen del plan operativo generado (camión × día). */
  operationalPlan?: WeeklyOperationalPlan | null;
  /** Mejoras previstas de la semana (Fase 0: contrato `WeeklyPlanForecast`). */
  expectedKpis?: WeeklyPlanForecast | null;
  preflight?: WeeklyPlanPreflight | null;
  preflightFeasible?: boolean | null;
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
  scheduledPoints: Array<{ id: number; code: string; sectorName?: string | null; fillLevelPct?: number | null }>;
  pendingPoints: PendingVisit[];
  pendingPointIds: number[];
  finalPointIds: number[];
  /** Previsto del día por el motor (Fase 0: contrato `PlanForecast`). */
  plannedKpis?: PlanForecast | null;
  /** Previsto vs. real del día (Fase 0: contrato `PlanVsReal`). */
  actualKpis?: PlanVsReal | null;
  dispatchedAt?: string | null;
  closedAt?: string | null;
  notes?: string | null;
}

export interface DailyCloseResult {
  closedAt: string;
  newPendingVisits: number;
  status: string;
}

export function isPastWeek(weekStartDate: string, reference = new Date()): boolean {
  return weekStartDate < mondayIso(reference);
}

export function isCurrentWeek(weekStartDate: string, reference = new Date()): boolean {
  return weekStartDate === mondayIso(reference);
}

export function sanitizeWeeklyPlanDays(days: WeeklyPlanDay[]): WeeklyPlanDay[] {
  return days.map((day) => ({
    ...day,
    collectionPointIds: day.collectionPointIds.filter(
      (id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0,
    ),
  }));
}

function sanitizeFleetByType(fleet: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!fleet || typeof fleet !== 'object') return null;
  const resolved: Record<string, number> = {};
  for (const [type, count] of Object.entries(fleet)) {
    const value = Number(count);
    if (Number.isFinite(value) && value >= 1) {
      resolved[type] = Math.floor(value);
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : null;
}

function mockWeeklyPlan(): WeeklyPlan {
  const start = mondayIso();
  const days: WeeklyPlanDay[] = [];
  for (let offset = 0; offset < 5; offset += 1) {
    const date = parseIsoDateLocal(start);
    date.setDate(date.getDate() + offset);
    days.push({
      operationDate: formatIsoDateLocal(date),
      weekday: offset,
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
    expectedKpis: {
      weekStartDate: start,
      distanceKm: 72.5,
      durationHours: 21.5,
      baselineDistanceKm: 96,
      savingPct: 24.5,
      scheduledPoints: 15,
      coveredPoints: 15,
      uncoveredPoints: 0,
      coveragePct: 100,
      vehicleCount: 5,
      days: {},
    },
    days,
  };
}

let mockWeeklyPlanItems: WeeklyPlan[] | null = null;
let mockWeeklyPlanNextId = 10;

function weekEndFromStart(weekStart: string): string {
  const date = parseIsoDateLocal(weekStart);
  date.setDate(date.getDate() + 4);
  return formatIsoDateLocal(date);
}

function buildMockAutofillDays(weekStartDate: string): WeeklyPlanDay[] {
  const pointIds = [1, 2, 3, 4, 5];
  const chunk = Math.max(1, Math.ceil(pointIds.length / 5));
  return Array.from({ length: 5 }, (_, offset) => {
    const date = parseIsoDateLocal(weekStartDate);
    date.setDate(date.getDate() + offset);
    return {
      operationDate: formatIsoDateLocal(date),
      weekday: offset,
      sectorIds: [],
      collectionPointIds: pointIds.slice(offset * chunk, (offset + 1) * chunk),
      status: 'planned',
    };
  });
}

function ensureMockWeeklyPlans(): WeeklyPlan[] {
  if (mockWeeklyPlanItems) return mockWeeklyPlanItems;
  const current = mondayIso();
  const prev = addWeeksToMonday(current, -1);
  const next = addWeeksToMonday(current, 1);
  mockWeeklyPlanItems = [
    {
      ...mockWeeklyPlan(),
      id: 3,
      weekStartDate: next,
      weekEndDate: weekEndFromStart(next),
      status: 'draft',
      days: [],
    },
    { ...mockWeeklyPlan(), id: 1, weekStartDate: current, status: 'approved' },
    {
      ...mockWeeklyPlan(),
      id: 2,
      weekStartDate: prev,
      weekEndDate: weekEndFromStart(prev),
      status: 'approved',
    },
  ];
  return mockWeeklyPlanItems;
}

function findMockWeeklyPlan(planId: number): WeeklyPlan | undefined {
  return ensureMockWeeklyPlans().find((plan) => plan.id === planId);
}

function upsertMockWeeklyPlan(plan: WeeklyPlan): WeeklyPlan {
  const items = ensureMockWeeklyPlans();
  const index = items.findIndex((row) => row.id === plan.id);
  if (index >= 0) {
    items[index] = plan;
  } else {
    items.push(plan);
  }
  return plan;
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
    plannedKpis: {
      distanceKm: 14.5,
      durationHours: 4.3,
      baselineDistanceKm: 19.2,
      savingPct: 24.5,
      scheduledPoints: 2,
      coveredPoints: 2,
      uncoveredPoints: 0,
      coveragePct: 100,
      vehicleCount: 1,
    },
    actualKpis: demoClosed
      ? {
          plannedDistanceKm: 14.5,
          actualDistanceKm: null,
          plannedDurationMin: 260,
          actualDurationMin: 288,
          scheduledPoints: 2,
          servedPoints: 1,
          collectedKg: 245.6,
          completionPct: 50,
        }
      : null,
  };
}

export function fetchWeeklyPlans(): Promise<{ items: WeeklyPlan[]; count: number }> {
  if (useMocks) {
    const items = ensureMockWeeklyPlans();
    return Promise.resolve({ items: [...items], count: items.length });
  }
  return apiGet('/api/v1/planning/weekly');
}

export function fetchWeeklyPlanById(planId: number): Promise<WeeklyPlan> {
  if (useMocks) {
    const plan = findMockWeeklyPlan(planId);
    if (!plan) {
      return Promise.resolve({ ...mockWeeklyPlan(), id: planId });
    }
    return Promise.resolve({ ...plan });
  }
  return apiGet(`/api/v1/planning/weekly/${planId}`);
}

export interface WeeklyDayPoint {
  id: number;
  code: string;
  sector?: string | null;
  fillLevelPct?: number;
  active?: boolean;
}

export interface WeeklyDayPlan {
  weeklyPlanId: number;
  operationDate: string;
  weekday: number;
  pointSource?: string | null;
  scenarioId: ScenarioId;
  expectedVehicleCount?: number | null;
  preflight?: Record<string, unknown> | null;
  simulation?: {
    operationDate?: string;
    distanceKm?: number;
    durationHours?: number;
    coveragePct?: number | null;
    feasible?: boolean;
    error?: string;
  } | null;
  points: WeeklyDayPoint[];
  pointCount: number;
}

export async function fetchWeeklyDayPlan(
  planId: number,
  operationDate: string,
): Promise<WeeklyDayPlan> {
  if (useMocks) {
    const plan = await fetchWeeklyPlanById(planId);
    const day = (plan.days ?? []).find((row) => row.operationDate === operationDate);
    const ids = day?.collectionPointIds ?? [1, 2, 3];
    return {
      weeklyPlanId: planId,
      operationDate,
      weekday: day?.weekday ?? 0,
      pointSource: day?.pointSource ?? null,
      scenarioId: plan.scenarioId ?? 'normal',
      expectedVehicleCount: day?.expectedVehicleCount ?? 2,
      preflight: null,
      simulation: null,
      points: ids.map((id, index) => ({
        id,
        code: `CNT-${String(id).padStart(3, '0')}`,
        sector: 'Unare I',
        fillLevelPct: 30 + (index * 17) % 60,
        active: true,
      })),
      pointCount: ids.length,
    };
  }
  return apiGet<WeeklyDayPlan>(`/api/v1/planning/weekly/${planId}/days/${operationDate}/plan`);
}

export function archiveWeeklyPlan(planId: number): Promise<WeeklyPlan> {
  if (useMocks) {
    const plan = findMockWeeklyPlan(planId) ?? { ...mockWeeklyPlan(), id: planId };
    return Promise.resolve(upsertMockWeeklyPlan({ ...plan, status: 'archived' }));
  }
  return apiPost(`/api/v1/planning/weekly/${planId}/archive`, {});
}

export function deleteWeeklyPlan(planId: number): Promise<{ id: number; deleted: boolean }> {
  if (useMocks) {
    const items = ensureMockWeeklyPlans();
    const index = items.findIndex((plan) => plan.id === planId);
    if (index >= 0) items.splice(index, 1);
    return Promise.resolve({ id: planId, deleted: index >= 0 });
  }
  return apiDelete(`/api/v1/planning/weekly/${planId}`);
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
    const start = parseIsoDateLocal(fromDate);
    const end = parseIsoDateLocal(toDate);
    const statuses = ['draft', 'optimized', 'dispatched', 'completed', 'draft', 'none', 'none'] as const;
    let index = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const operationDate = formatIsoDateLocal(cursor);
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
  caseStudyId?: number | null;
  fleetByType?: Record<string, number> | null;
  days: Array<{ operationDate: string; collectionPointIds: number[] }>;
  notes?: string;
}): Promise<WeeklyPlan> {
  const sanitizedPayload = {
    ...payload,
    fleetByType: sanitizeFleetByType(payload.fleetByType),
    days: payload.days.map((day) => ({
      operationDate: day.operationDate,
      collectionPointIds: day.collectionPointIds.filter(
        (id) => typeof id === 'number' && Number.isFinite(id) && id > 0,
      ),
    })),
  };
  if (useMocks) {
    const id = mockWeeklyPlanNextId++;
    const plan = upsertMockWeeklyPlan({
      ...mockWeeklyPlan(),
      id,
      status: 'draft',
      weekStartDate: sanitizedPayload.weekStartDate,
      weekEndDate: weekEndFromStart(sanitizedPayload.weekStartDate),
      fleetByType: sanitizedPayload.fleetByType ?? null,
      days: sanitizedPayload.days.map((day, index) => ({
        operationDate: day.operationDate,
        weekday: new Date(day.operationDate).getDay() === 0 ? 6 : new Date(day.operationDate).getDay() - 1,
        sectorIds: [],
        collectionPointIds: day.collectionPointIds,
        id: index + 1,
      })),
    });
    return Promise.resolve(plan);
  }
  return apiPost('/api/v1/planning/weekly', sanitizedPayload);
}

export function updateWeeklyPlan(
  planId: number,
  payload: {
    scenarioId?: ScenarioId;
    caseStudyId?: number | null;
    fleetByType?: Record<string, number> | null;
    days?: WeeklyPlanDay[];
    notes?: string;
  },
): Promise<WeeklyPlan> {
  const sanitizedPayload = payload.days
    ? { ...payload, days: sanitizeWeeklyPlanDays(payload.days) }
    : payload;
  const withFleet =
    'fleetByType' in sanitizedPayload
      ? { ...sanitizedPayload, fleetByType: sanitizeFleetByType(sanitizedPayload.fleetByType) }
      : sanitizedPayload;
  if (useMocks) {
    const existing = findMockWeeklyPlan(planId) ?? { ...mockWeeklyPlan(), id: planId };
    const plan = upsertMockWeeklyPlan({
      ...existing,
      ...withFleet,
      days: withFleet.days
        ? sanitizeWeeklyPlanDays(withFleet.days)
        : existing.days,
    });
    return Promise.resolve(plan);
  }
  return apiPatch(`/api/v1/planning/weekly/${planId}`, withFleet);
}

export function validateWeeklyPlan(planId: number): Promise<{ jobId: string; weeklyPlanId: number }> {
  if (useMocks) return Promise.resolve({ jobId: 'mock-job', weeklyPlanId: planId });
  return apiPost(`/api/v1/planning/weekly/${planId}/validate`, {});
}

export function generateWeeklyOperationalPlan(
  planId: number,
): Promise<{ jobId: string; weeklyPlanId: number }> {
  if (useMocks) return Promise.resolve({ jobId: 'mock-job', weeklyPlanId: planId });
  return apiPost(`/api/v1/planning/weekly/${planId}/generate-operational`, {});
}

export interface WeeklyNotifyDayResult {
  operationDate: string;
  status: string;
  dailyPlanId: number;
  dispatchedRouteIds: number[];
}

export function notifyWeeklyOperationalDays(
  planId: number,
): Promise<{ items: WeeklyNotifyDayResult[]; count: number }> {
  if (useMocks) {
    return Promise.resolve({ items: [], count: 0 });
  }
  return apiPost(`/api/v1/planning/weekly/${planId}/notify-days`, {});
}

export function approveWeeklyPlan(
  planId: number,
  payload?: { referenceSimulationId?: number; expectedKpis?: WeeklyPlanForecast },
): Promise<WeeklyPlan> {
  if (useMocks) {
    const existing = findMockWeeklyPlan(planId) ?? { ...mockWeeklyPlan(), id: planId };
    return Promise.resolve(upsertMockWeeklyPlan({ ...existing, status: 'approved' }));
  }
  return apiPost(`/api/v1/planning/weekly/${planId}/approve`, payload ?? {});
}

/**
 * Carga el plan del día. Si no existe:
 * - admin/planificador → lo crea (`POST .../ensure`)
 * - conductor/residente → devuelve `null` (solo lectura; no tiene permiso)
 */
export async function fetchDailyPlan(operationDate: string): Promise<DailyPlan | null> {
  if (useMocks) return Promise.resolve(mockDailyPlan(operationDate));
  try {
    return await apiGet<DailyPlan>(`/api/v1/planning/daily/${operationDate}`);
  } catch (error) {
    const isNotFound = error instanceof ApiError && error.status === 404;
    if (!isNotFound) throw error;
    if (!canEnsureDailyPlan(authUser()?.role)) return null;
    return apiPost<DailyPlan>(`/api/v1/planning/daily/${operationDate}/ensure`, {});
  }
}

export function openDailyPlan(operationDate: string): Promise<DailyPlan> {
  if (useMocks) return Promise.resolve(mockDailyPlan(operationDate));
  return apiPost(`/api/v1/planning/daily/${operationDate}/open`, {});
}

export interface DailyOptimizeOptions {
  priorityFillLevel?: boolean;
  timeWindowEnabled?: boolean;
  kpiView?: 'distance' | 'time' | 'co2';
  departureHour?: number;
  /** Jornada de turno (h, 1–12). Recorta el presupuesto del motor y reparte la carga. */
  estimatedDurationHours?: number;
  /** Fase 13 — peso de equidad de carga (0 = solo distancia). */
  workloadBalanceWeight?: number;
  /** Fase 13 — peso del makespan (0 = solo distancia). */
  makespanWeight?: number;
  /** Fase 13 — mínimo de vehículos activos del día. */
  minActiveVehicles?: number;
  /** Fase 13 — jornada objetivo (h) del KPI de cumplimiento. */
  maxRouteHoursTarget?: number;
}

export function optimizeDailyPlan(
  dailyPlanId: number,
  options?: DailyOptimizeOptions,
): Promise<{ jobId: string; dailyPlanId: number; pointCount: number }> {
  if (useMocks) return Promise.resolve({ jobId: 'mock-job', dailyPlanId, pointCount: 3 });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/optimize`, options ?? {});
}

export function dispatchDailyPlan(dailyPlanId: number): Promise<{ dispatchedRouteIds: number[]; count: number }> {
  if (useMocks) return Promise.resolve({ dispatchedRouteIds: [1, 2], count: 2 });
  return apiPost(
    `/api/v1/planning/daily/${dailyPlanId}/dispatch`,
    {},
    { headers: idempotencyHeaders() },
  );
}

export interface DeferUncoveredResult {
  created: number;
  targetOperationDate: string | null;
  codes: string[];
  missingCodes?: string[];
  message: string;
}

export function deferUncoveredPoints(
  dailyPlanId: number,
  targetOperationDate?: string,
): Promise<DeferUncoveredResult> {
  if (useMocks) {
    return Promise.resolve({
      created: 2,
      targetOperationDate: targetOperationDate ?? tomorrowIso(),
      codes: ['CNT-001', 'CNT-002'],
      message: '2 pendiente(s) creado(s) para mañana',
    });
  }
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/defer-uncovered`, {
    targetOperationDate: targetOperationDate ?? null,
  });
}

export function closeDailyPlan(dailyPlanId: number): Promise<DailyCloseResult> {
  if (useMocks) return Promise.resolve({ closedAt: new Date().toISOString(), newPendingVisits: 2, status: 'partial' });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/close`, {});
}

/**
 * Registra una **ejecución simulada** del día (demo): marca las paradas como visitadas con su
 * llegada estimada como real y consolida el previsto vs. real. No cierra el día.
 */
export function simulateDailyExecution(
  dailyPlanId: number,
): Promise<{ dailyPlanId: number; executedWaypoints: number }> {
  if (useMocks) return Promise.resolve({ dailyPlanId, executedWaypoints: 140 });
  return apiPost(`/api/v1/planning/daily/${dailyPlanId}/simulate-execution`, {});
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
  if (useMocks) {
    const existing = findMockWeeklyPlan(planId) ?? { ...mockWeeklyPlan(), id: planId, status: 'draft' };
    const plan = upsertMockWeeklyPlan({
      ...existing,
      status: 'draft',
      days: buildMockAutofillDays(existing.weekStartDate),
    });
    return Promise.resolve(plan);
  }
  return apiPost(`/api/v1/planning/weekly/${planId}/autofill-from-schedules`, {});
}

export function autofillWeeklyPlanFromCaseStudy(
  planId: number,
  caseStudyId?: number | null,
): Promise<WeeklyPlan> {
  if (useMocks) {
    const existing = findMockWeeklyPlan(planId) ?? { ...mockWeeklyPlan(), id: planId, status: 'draft' };
    const pointIds = [1, 2, 3, 4, 5];
    const plan = upsertMockWeeklyPlan({
      ...existing,
      status: 'draft',
      caseStudyId: caseStudyId ?? existing.caseStudyId ?? 1,
      caseStudyCode: 'CE-MOCK',
      days: buildMockAutofillDays(existing.weekStartDate).map((day) => ({
        ...day,
        collectionPointIds: pointIds,
        pointSource: 'case_study' as const,
      })),
    });
    return Promise.resolve(plan);
  }
  const query = caseStudyId != null ? `?caseStudyId=${caseStudyId}` : '';
  return apiPost(`/api/v1/planning/weekly/${planId}/autofill-from-case-study${query}`, {});
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

export interface PendingBulkCancelResult {
  cancelled: number;
  ids: number[];
}

export function cancelBulkPendingVisits(params: {
  pendingIds?: number[];
  olderThanDays?: number;
  targetDate?: string;
}): Promise<PendingBulkCancelResult> {
  if (useMocks) {
    const ids = params.pendingIds ?? [];
    return Promise.resolve({ cancelled: ids.length, ids });
  }
  return apiPost<PendingBulkCancelResult>('/api/v1/planning/pending/cancel-bulk', params);
}

export function resolvePendingVisit(pendingId: number): Promise<PendingVisit> {
  if (useMocks) {
    return Promise.resolve({
      id: pendingId,
      collectionPointId: 1,
      originOperationDate: new Date().toISOString().slice(0, 10),
      reason: 'resolved',
      status: 'resolved',
      priority: 0,
    });
  }
  return apiPost<PendingVisit>(`/api/v1/planning/pending/${pendingId}/resolve`, {});
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
