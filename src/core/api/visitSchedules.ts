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

export interface VisitScheduleInput {
  visitsPerWeek: number;
  weekdays: number[];
  isExtraVisit?: boolean;
  effectiveFrom?: string;
  effectiveUntil?: string;
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
