import { describe, expect, it } from 'vitest';
import type { SystemAlert } from '../types/alert';
import {
  buildOperatorAlertContext,
  filterOperatorAlerts,
  scoreOperatorAlert,
} from './operatorAlertsUx';

function alert(partial: Partial<SystemAlert> & Pick<SystemAlert, 'id'>): SystemAlert {
  return {
    title: 'Alerta',
    detail: '',
    source: '',
    location: '',
    category: 'operativa',
    priority: 'advertencia',
    status: 'activa',
    datetime: '2026-08-13 10:00',
    lat: 10.4,
    lng: -66.9,
    ...partial,
  };
}

describe('operatorAlertsUx', () => {
  it('prioritizes own breakdown alerts and vehicle matches', () => {
    const ctx = buildOperatorAlertContext({
      vehicleId: 'TR-08',
      stops: [{ code: 'CNT-101', sectorName: 'Sector A', sequenceOrder: 1, lat: 1, lng: 2 }],
      incidentAlertIds: ['al-inc-42'],
    });

    expect(scoreOperatorAlert(alert({ id: 'al-inc-42', source: 'TR-08' }), ctx)).toBe(100);
    expect(scoreOperatorAlert(alert({ id: 'al-1', source: 'Vehículo TR-08' }), ctx)).toBe(95);
    expect(scoreOperatorAlert(alert({ id: 'al-2', location: 'Sector A' }), ctx)).toBe(65);
    expect(scoreOperatorAlert(alert({ id: 'al-3', detail: 'CNT-101 lleno' }), ctx)).toBe(82);
    expect(scoreOperatorAlert(alert({ id: 'al-4', source: 'Otro sector' }), ctx)).toBe(0);
  });

  it('filters out unrelated alerts for the operator', () => {
    const ctx = buildOperatorAlertContext({
      vehicleId: 'TR-08',
      stops: [{ code: 'CNT-101', sectorName: 'Sector A', sequenceOrder: 1, lat: 1, lng: 2 }],
    });
    const filtered = filterOperatorAlerts(
      [
        alert({ id: 'keep-vehicle', source: 'TR-08 en ruta' }),
        alert({ id: 'keep-sector', location: 'Sector A norte' }),
        alert({ id: 'drop', source: 'Planificación central' }),
      ],
      ctx,
    );
    expect(filtered.map((row) => row.id)).toEqual(['keep-vehicle', 'keep-sector']);
  });
});
