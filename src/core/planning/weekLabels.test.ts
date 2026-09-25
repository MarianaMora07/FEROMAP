import { describe, expect, it } from 'vitest';
import { formatWeekRangeLabel, weekEndIso } from './weekLabels';

describe('weekLabels', () => {
  it('computes the sunday of the week from its monday', () => {
    expect(weekEndIso('2026-09-21')).toBe('2026-09-27');
    expect(weekEndIso('2026-09-28')).toBe('2026-10-04');
  });

  it('labels a week inside a single month', () => {
    expect(formatWeekRangeLabel('2026-09-21')).toBe('21–27 sep');
    expect(formatWeekRangeLabel('2026-09-28')).toBe('28 sep – 4 oct');
  });

  it('labels a week that crosses months and years', () => {
    expect(formatWeekRangeLabel('2026-08-31')).toBe('31 ago – 6 sep');
    expect(formatWeekRangeLabel('2026-12-28')).toBe('28 dic – 3 ene');
  });
});
