import { apiGet, useMocks } from './client';
import type { DailyPlan, WeeklyPlan } from './planning';
import type { IncidentTrace } from './planningAnalytics';
import type { OperationalHistoryRow } from '../utils/operationalHistory';

export interface PlanningHistoryWeeklyData {
  items: WeeklyPlan[];
  count: number;
  total: number;
}

export type PlanningHistoryResponse =
  | { type: 'weekly'; data: PlanningHistoryWeeklyData }
  | { type: 'daily'; data: DailyPlan; operationalRuns: OperationalHistoryRow[] }
  | { type: 'incident_trace'; data: IncidentTrace };

export interface PlanningHistoryFilters {
  weekStart?: string;
  operationDate?: string;
  incidentId?: number;
  limit?: number;
}

function mockWeeklyHistory(weekStart: string): PlanningHistoryResponse {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);
  return {
    type: 'weekly',
    data: {
      items: [
        {
          id: 1,
          weekStartDate: weekStart,
          weekEndDate: end.toISOString().slice(0, 10),
          status: 'approved',
          scenarioId: 'normal',
          days: Array.from({ length: 5 }, (_, index) => {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + index);
            return {
              operationDate: date.toISOString().slice(0, 10),
              weekday: index,
              sectorIds: [],
              collectionPointIds: [1 + index, 2 + index],
            };
          }),
        },
      ],
      count: 1,
      total: 1,
    },
  };
}

function mockDailyHistory(operationDate: string): PlanningHistoryResponse {
  return {
    type: 'daily',
    data: {
      id: 1,
      operationDate,
      status: 'dispatched',
      scenarioId: 'normal',
      weeklyPlanId: 1,
      simulationId: 42,
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
      dispatchedAt: new Date().toISOString(),
    },
    operationalRuns: [
      {
        id: 42,
        dailyPlanId: 1,
        operationDate,
        status: 'dispatched',
        pointCount: 12,
        distanceKm: 28.4,
        name: `Operación ${operationDate}`,
        datetime: new Date().toISOString(),
        efficiency: 18,
        scenarioId: 'normal',
        contingency: false,
      },
    ],
  };
}

function mockIncidentHistory(incidentId: number): PlanningHistoryResponse {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().slice(0, 10);
  return {
    type: 'incident_trace',
    data: {
      incident: {
        id: incidentId,
        incidentType: 'breakdown',
        description: 'Avería reportada en ruta activa',
        reportedAt: new Date().toISOString(),
        vehicleId: 'TR-08',
        routeId: 3,
      },
      pendingVisits: [
        {
          pendingVisit: {
            id: 1,
            code: 'CNT-016',
            originOperationDate: new Date().toISOString().slice(0, 10),
            status: 'open',
            reason: 'incident_reroute',
          },
          nextDailyPlan: {
            id: 2,
            operationDate: targetDate,
            status: 'draft',
          },
          targetOperationDate: targetDate,
        },
      ],
    },
  };
}

export function fetchPlanningHistory(filters: PlanningHistoryFilters): Promise<PlanningHistoryResponse> {
  if (useMocks) {
    if (filters.incidentId != null) return Promise.resolve(mockIncidentHistory(filters.incidentId));
    if (filters.operationDate) return Promise.resolve(mockDailyHistory(filters.operationDate));
    return Promise.resolve(mockWeeklyHistory(filters.weekStart ?? new Date().toISOString().slice(0, 10)));
  }

  const params = new URLSearchParams();
  if (filters.weekStart) params.set('weekStart', filters.weekStart);
  if (filters.operationDate) params.set('operationDate', filters.operationDate);
  if (filters.incidentId != null) params.set('incidentId', String(filters.incidentId));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiGet(`/api/v1/planning/history${query ? `?${query}` : ''}`);
}
