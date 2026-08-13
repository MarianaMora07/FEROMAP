import { describe, expect, it } from 'vitest';
import type { ResidentOverview } from '../api/resident';
import type { AuthUser } from '../types/auth';
import { deriveResidentFieldContext } from './residentUx';
import {
  deriveNextResidentAction,
  getResidentQuickActions,
  residentServiceStatusLabel,
} from './residentHubUx';

function overview(partial: Partial<ResidentOverview> = {}): ResidentOverview {
  return {
    sectorName: 'Unare I',
    schedule: {
      collectionDays: 'Lunes, Miércoles, Viernes',
      window: '07:00 — 12:00',
      nextCollection: 'Viernes',
      frequency: '3x/semana',
      isCollectionDay: true,
      hasWeeklyPlan: true,
      hasSchedule: true,
      source: 'weekly_plan',
      calendar: [],
    },
    proximity: {
      status: 'approaching',
      vehicleCode: 'TR-08',
      routeId: 42,
      estimatedMinutes: 20,
      stopsBeforeSector: 2,
      nextStopInSector: 'CNT-001',
      completedStopsInSector: 0,
      totalStopsInSector: 4,
      lastUpdatedAt: new Date().toISOString(),
    },
    collectionPoints: [],
    activeRoutesInSector: [
      {
        routeId: 42,
        vehicle: 'TR-08',
        status: 'in_progress',
        stopsInSector: 4,
        pendingStops: 3,
        nextStop: 'CNT-001',
      },
    ],
    alerts: [],
    stats: { totalPoints: 8, criticalPoints: 1, routesServingSector: 1 },
    ...partial,
  };
}

const residentUser: AuthUser = {
  id: 20,
  email: 'residente@fero.com',
  firstName: 'María',
  lastName: 'Residente',
  role: 'residente',
  sectorId: 1,
  sectorName: 'Unare I',
};

describe('residentHubUx', () => {
  it('exposes quick actions with sector map and alerts deep links', () => {
    const actions = getResidentQuickActions({ sectorId: 1, focus: 'truck' });
    expect(actions.map((item) => item.id)).toEqual(['map', 'alerts', 'points']);
    expect(actions[0].href).toContain('scope=sector');
    expect(actions[0].href).toContain('focus=truck');
    expect(actions[1].href).toBe('/alerts?scope=sector');
  });

  it('derives approaching next action with map link to truck focus', () => {
    const context = deriveResidentFieldContext({
      overview: overview(),
      user: residentUser,
    });
    const action = deriveNextResidentAction(context, { sectorId: 1 });

    expect(action.tone).toBe('info');
    expect(action.message).toContain('TR-08');
    expect(action.href).toContain('focus=truck');
    expect(action.label).toBe('Ver en mapa');
  });

  it('reports service status from proximity for active collection', () => {
    const context = deriveResidentFieldContext({
      overview: overview({ proximity: { ...overview().proximity, status: 'in_sector' } }),
      user: residentUser,
    });
    expect(residentServiceStatusLabel(context)).toBe('En tu sector');
  });

  it('handles resident without sector assignment', () => {
    const context = deriveResidentFieldContext({
      overview: undefined,
      user: { ...residentUser, sectorId: null, sectorName: null },
    });
    const action = deriveNextResidentAction(context);

    expect(context.hasSector).toBe(false);
    expect(action.tone).toBe('error');
    expect(action.message).toContain('sector asignado');
  });
});
