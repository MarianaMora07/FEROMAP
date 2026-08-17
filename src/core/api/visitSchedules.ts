import { apiGet, apiPatch, useMocks } from './client';

export interface VisitSchedule {
  id: number;
  collectionPointId: number;
  pointCode: string;
  visitsPerWeek: number;
  weekdays: number[];
  isExtraVisit: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}

const MOCK_VISIT_SCHEDULES: VisitSchedule[] = [
  { id: 1, collectionPointId: 1, pointCode: 'CNT-001', visitsPerWeek: 3, weekdays: [0, 2, 4], isExtraVisit: false, effectiveFrom: '2026-01-01' },
  { id: 2, collectionPointId: 2, pointCode: 'CNT-002', visitsPerWeek: 2, weekdays: [1, 4], isExtraVisit: false, effectiveFrom: '2026-01-01' },
  { id: 3, collectionPointId: 3, pointCode: 'CNT-003', visitsPerWeek: 3, weekdays: [0, 2, 4], isExtraVisit: false, effectiveFrom: '2026-01-01' },
  { id: 4, collectionPointId: 4, pointCode: 'CNT-004', visitsPerWeek: 1, weekdays: [3], isExtraVisit: false, effectiveFrom: '2026-01-01' },
  { id: 5, collectionPointId: 5, pointCode: 'CNT-005', visitsPerWeek: 2, weekdays: [1, 3], isExtraVisit: false, effectiveFrom: '2026-01-01' },
];

export interface VisitScheduleInput {
  visitsPerWeek: number;
  weekdays: number[];
  isExtraVisit?: boolean;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export function fetchActiveVisitSchedules(referenceDate?: string): Promise<VisitSchedule[]> {
  if (useMocks) {
    return Promise.resolve(MOCK_VISIT_SCHEDULES);
  }
  const query = referenceDate ? `?reference=${encodeURIComponent(referenceDate)}` : '';
  return apiGet<{ items: VisitSchedule[] }>(`/api/v1/planning/visit-schedules${query}`).then((response) => response.items);
}

export async function fetchVisitSchedule(code: string): Promise<VisitSchedule | null> {
  if (useMocks) {
    return {
      id: 1,
      collectionPointId: 1,
      pointCode: code,
      visitsPerWeek: 3,
      weekdays: [0, 2, 4],
      isExtraVisit: false,
      effectiveFrom: '2026-01-01',
    };
  }
  try {
    return await apiGet<VisitSchedule>(`/api/v1/collection-points/${code}/visit-schedule`);
  } catch {
    return null;
  }
}

export function upsertVisitSchedule(code: string, payload: VisitScheduleInput): Promise<VisitSchedule> {
  if (useMocks) {
    return Promise.resolve({
      id: 1,
      collectionPointId: 1,
      pointCode: code,
      visitsPerWeek: payload.visitsPerWeek,
      weekdays: payload.weekdays,
      isExtraVisit: payload.isExtraVisit ?? false,
      effectiveFrom: payload.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      effectiveUntil: payload.effectiveUntil ?? null,
    });
  }
  return apiPatch<VisitSchedule>(`/api/v1/collection-points/${code}/visit-schedule`, payload);
}
