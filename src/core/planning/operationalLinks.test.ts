import { describe, expect, it } from 'vitest';
import {
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
});
