import { describe, expect, it } from 'vitest';
import {
  residentAlertsHref,
  residentHubHref,
  residentHubScheduleHref,
  residentMapHref,
  residentPointsHref,
} from './residentDeepLinks';

describe('residentDeepLinks', () => {
  it('builds map href with sector scope and focus', () => {
    expect(residentMapHref()).toBe('/map?scope=sector&focus=sector');
    expect(residentMapHref({ focus: 'truck', sectorId: 7 })).toBe(
      '/map?scope=sector&focus=truck&sectorId=7',
    );
    expect(residentMapHref({ focus: 'routes' })).toBe('/map?scope=sector&focus=routes');
  });

  it('builds alerts and points hrefs for resident navigation', () => {
    expect(residentAlertsHref()).toBe('/alerts?scope=sector');
    expect(residentPointsHref()).toBe('/collection-points');
    expect(residentHubHref()).toBe('/resident');
    expect(residentHubScheduleHref()).toBe('/resident#horario-recoleccion');
  });
});
