import { apiGet, withMockFallback } from './client';

export interface PlanningLevelMetrics {
  weeklyCompliancePct?: number;
  visitCompliancePct?: number;
  carryOverPct?: number;
  weeksTracked?: number;
  plannedKm?: number;
  executedKm?: number;
  plannedHours?: number;
  executedHours?: number;
  kmVariancePct?: number;
  dailyPlans?: number;
  optimizedDays?: number;
  dispatchedDays?: number;
  openPendingVisits?: number;
  scheduledDays?: number;
  closedDays?: number;
  openIncidents?: number;
  operationalRecalcs?: number;
  routesInProgress?: number;
}

export interface PlanningAnalyticsSummary {
  range: { weekFrom: string; weekTo: string };
  levels: {
    directivo: PlanningLevelMetrics;
    administrativo: PlanningLevelMetrics;
    operativo: PlanningLevelMetrics;
  };
  trends: {
    labels: string[];
    weeklyCompliancePct: number[];
    carryOverPct: number[];
    plannedKm: number[];
    executedKm: number[];
  };
}

export interface PlanningDashboardSnapshot {
  weeklyPlan: {
    id: number;
    weekStartDate: string;
    weekEndDate: string;
    status: string;
    daysConfigured: number;
    scheduledPoints: number;
  } | null;
  dailyPlan: {
    id: number;
    operationDate: string;
    status: string;
    pointCount: number;
    pendingCount: number;
    dispatched: boolean;
  } | null;
  openIncidents: number;
  openPendingVisits: number;
}

const mockPlanningAnalytics: PlanningAnalyticsSummary = {
  range: { weekFrom: '2026-08-04', weekTo: '2026-08-11' },
  levels: {
    directivo: {
      weeklyCompliancePct: 82,
      carryOverPct: 12,
      plannedKm: 420,
      executedKm: 398,
      kmVariancePct: -5.2,
    },
    administrativo: {
      dailyPlans: 5,
      optimizedDays: 4,
      dispatchedDays: 3,
      openPendingVisits: 6,
    },
    operativo: {
      openIncidents: 2,
      operationalRecalcs: 3,
      routesInProgress: 2,
    },
  },
  trends: {
    labels: ['2026-07-28', '2026-08-04'],
    weeklyCompliancePct: [78, 82],
    carryOverPct: [15, 12],
    plannedKm: [410, 420],
    executedKm: [385, 398],
  },
};

export function fetchPlanningAnalytics(weekFrom?: string, weekTo?: string): Promise<PlanningAnalyticsSummary> {
  const params = new URLSearchParams();
  if (weekFrom) params.set('weekFrom', weekFrom);
  if (weekTo) params.set('weekTo', weekTo);
  const query = params.toString() ? `?${params.toString()}` : '';
  return withMockFallback(
    'planning-analytics',
    () => apiGet<PlanningAnalyticsSummary>(`/api/v1/analytics/planning${query}`),
    mockPlanningAnalytics,
  );
}

export function fetchPlanningDashboardSnapshot(): Promise<PlanningDashboardSnapshot> {
  return withMockFallback(
    'planning-dashboard-snapshot',
    () => apiGet<PlanningDashboardSnapshot>('/api/v1/planning/dashboard-snapshot'),
    {
      weeklyPlan: {
        id: 1,
        weekStartDate: '2026-08-10',
        weekEndDate: '2026-08-16',
        status: 'approved',
        daysConfigured: 5,
        scheduledPoints: 48,
      },
      dailyPlan: {
        id: 1,
        operationDate: new Date().toISOString().slice(0, 10),
        status: 'dispatched',
        pointCount: 12,
        pendingCount: 2,
        dispatched: true,
      },
      openIncidents: 2,
      openPendingVisits: 6,
    },
  );
}

export interface IncidentTrace {
  incident: {
    id: number;
    incidentType: string;
    description: string | null;
    reportedAt: string | null;
    vehicleId: string | null;
    routeId: number | null;
  };
  pendingVisits: Array<{
    pendingVisit: Record<string, unknown>;
    nextDailyPlan: Record<string, unknown> | null;
    targetOperationDate: string;
  }>;
}

export function fetchIncidentTrace(incidentId: number): Promise<IncidentTrace> {
  return apiGet<IncidentTrace>(`/api/v1/planning/trace/incident/${incidentId}`);
}
