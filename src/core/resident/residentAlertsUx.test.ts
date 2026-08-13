import { describe, expect, it } from 'vitest';
import type { SystemAlert } from '../types/alert';
import type { ResidentOverview } from '../api/resident';
import {
  buildResidentDerivedAlerts,
  buildResidentSectorAlerts,
  filterResidentAlerts,
  isInternalFleetAlert,
  scoreResidentAlert,
} from './residentAlertsUx';

function systemAlert(partial: Partial<SystemAlert> & Pick<SystemAlert, 'id'>): SystemAlert {
  return {
    title: 'Alerta',
    detail: '',
    source: '',
    location: '',
    category: 'contenedores',
    priority: 'advertencia',
    status: 'nueva',
    datetime: '13/08/2026 10:00',
    lat: 8.29,
    lng: -62.72,
    ...partial,
  };
}

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
      routeId: 1,
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
        routeId: 1,
        vehicle: 'TR-08',
        status: 'in_progress',
        stopsInSector: 4,
        pendingStops: 3,
        nextStop: 'CNT-001',
      },
    ],
    alerts: [],
    stats: {
      totalPoints: 12,
      criticalPoints: 3,
      routesServingSector: 1,
    },
    ...partial,
  };
}

describe('residentAlertsUx', () => {
  it('builds derived alerts for horario, critico and retraso', () => {
    const alerts = buildResidentDerivedAlerts(overview());
    expect(alerts.some((alert) => alert.kind === 'horario' && alert.title.includes('L-X-V'))).toBe(true);
    expect(alerts.some((alert) => alert.kind === 'critico' && alert.title.includes('3 contenedores'))).toBe(true);
    expect(alerts.some((alert) => alert.kind === 'retraso' && alert.title.includes('TR-08'))).toBe(true);
  });

  it('excludes internal fleet alerts from sector filtering', () => {
    const ctx = {
      sectorName: 'Unare I',
      activeRoutes: overview().activeRoutesInSector,
      vehicleCodes: ['TR-08'],
    };
    expect(
      isInternalFleetAlert(
        systemAlert({ id: 'maint', category: 'mantenimiento', source: 'Vehículo TR-02' }),
        ctx,
      ),
    ).toBe(true);
    expect(scoreResidentAlert(systemAlert({ id: 'other', location: 'Villa Asia' }), ctx)).toBe(0);
    expect(
      scoreResidentAlert(
        systemAlert({ id: 'sector-traffic', category: 'trafico', location: 'Unare I norte' }),
        ctx,
      ),
    ).toBeGreaterThanOrEqual(85);
  });

  it('merges derived alerts with filtered system alerts without duplicates', () => {
    const merged = buildResidentSectorAlerts({
      overview: overview(),
      systemAlerts: [
        systemAlert({
          id: 'keep',
          category: 'trafico',
          location: 'Unare I',
          title: 'Retraso en recolección',
          detail: 'Retraso estimado 25 min',
          source: 'Ruta TR-08',
        }),
        systemAlert({ id: 'drop', category: 'mantenimiento', source: 'Taller Central' }),
      ],
    });
    expect(merged.some((alert) => alert.id === 'system-keep')).toBe(true);
    expect(merged.some((alert) => alert.id === 'system-drop')).toBe(false);
    expect(merged.some((alert) => alert.kind === 'horario')).toBe(true);
  });

  it('filters unrelated system alerts for the resident sector', () => {
    const ctx = { sectorName: 'Unare I', vehicleCodes: ['TR-08'], activeRoutes: overview().activeRoutesInSector };
    const filtered = filterResidentAlerts(
      [
        systemAlert({ id: 'keep', source: 'TR-08', detail: 'Retraso en sector' }),
        systemAlert({ id: 'drop', source: 'Planificación central', location: 'Oficina' }),
      ],
      ctx,
    );
    expect(filtered.map((row) => row.id)).toEqual(['keep']);
  });
});
