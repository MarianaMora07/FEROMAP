import { describe, expect, it } from 'vitest';
import {
  mapPlaybackHref,
  monitoringPlaybackHref,
  operationalMapHref,
  optimizationPlaybackHref,
} from './operationalLinks';

describe('operationalLinks', () => {
  it('builds map link with routes focus', () => {
    expect(operationalMapHref({ focus: 'routes' })).toBe('/map?focus=routes');
  });

  it('builds optimization playback deep link', () => {
    expect(optimizationPlaybackHref({ date: '2026-08-14', dailyPlanId: 9 })).toBe(
      '/optimization?date=2026-08-14&dailyPlanId=9&playback=1',
    );
  });

  it('builds monitoring playback deep link', () => {
    expect(monitoringPlaybackHref({ dailyPlanId: 9 })).toBe('/monitoring?dailyPlanId=9&playback=1');
  });

  it('builds map GIS playback deep link', () => {
    expect(mapPlaybackHref({ date: '2026-08-15', dailyPlanId: 4 })).toBe(
      '/map?date=2026-08-15&dailyPlanId=4&playback=1',
    );
  });
});
