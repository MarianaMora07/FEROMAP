import { describe, expect, it } from 'vitest';
import {
  BASE_SERVICE_SECONDS,
  buildCrewServiceBreakdown,
  resolveEffectiveAssigned,
  routeTotalDurationSeconds,
  serviceTimeSecondsPerStop,
} from './crewServiceTime';

describe('crewServiceTime contract', () => {
  it.each([
    [6, 1200],
    [5, 1380],
    [1, 2100],
  ])('service_time: assigned %i → %i s/punto', (assigned, expected) => {
    expect(serviceTimeSecondsPerStop(assigned)).toBe(expected);
  });

  it('20 min por punto con dotación completa', () => {
    expect(resolveEffectiveAssigned(6, { operatorsShortage: 2 })).toBe(4);
    expect(serviceTimeSecondsPerStop(4)).toBe(1560);
  });

  it('suma viaje + paradas en duración total', () => {
    expect(routeTotalDurationSeconds(2400, 5, 6)).toBe(8400);
  });

  it('genera etiqueta de cuadrilla', () => {
    const breakdown = buildCrewServiceBreakdown({
      travelSeconds: 2400,
      stopCount: 5,
      assigned: 5,
    });
    expect(breakdown.crewLabel).toContain('conductor + 4 operarios');
  });
});
