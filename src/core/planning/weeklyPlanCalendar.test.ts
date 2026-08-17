import { describe, expect, it } from 'vitest';
import {
  addDaysToIso,
  compactWeeklyPlanDaysForSave,
  findWeeklyPlanMissingFromSchedules,
  isoWeekdayMon0,
  mergeWeekCalendarDays,
} from './weeklyPlanCalendar';

describe('weeklyPlanCalendar', () => {
  it('keeps monday as first day when adding offsets', () => {
    expect(addDaysToIso('2026-08-17', 0)).toBe('2026-08-17');
    expect(addDaysToIso('2026-08-17', 4)).toBe('2026-08-21');
    expect(isoWeekdayMon0('2026-08-17')).toBe(0);
    expect(isoWeekdayMon0('2026-08-21')).toBe(4);
  });

  it('merges sparse backend days into a full week calendar', () => {
    const days = mergeWeekCalendarDays('2026-08-17', [
      {
        operationDate: '2026-08-19',
        weekday: 2,
        sectorIds: [],
        collectionPointIds: [1, 2],
      },
    ]);
    expect(days).toHaveLength(7);
    expect(days[0]?.operationDate).toBe('2026-08-17');
    expect(days[0]?.collectionPointIds).toEqual([]);
    expect(days[2]?.collectionPointIds).toEqual([1, 2]);
    expect(days[4]?.operationDate).toBe('2026-08-21');
  });

  it('compacts empty days before save', () => {
    const compact = compactWeeklyPlanDaysForSave('2026-08-17', mergeWeekCalendarDays('2026-08-17', []));
    expect(compact).toEqual([]);
    const withPoints = compactWeeklyPlanDaysForSave(
      '2026-08-17',
      mergeWeekCalendarDays('2026-08-17', [
        {
          operationDate: '2026-08-17',
          weekday: 0,
          sectorIds: [],
          collectionPointIds: [9],
        },
      ]),
    );
    expect(withPoints).toHaveLength(1);
    expect(withPoints[0]?.operationDate).toBe('2026-08-17');
    expect(withPoints[0]?.weekday).toBe(0);
  });

  it('detects visit-schedule points missing from the week', () => {
    const missing = findWeeklyPlanMissingFromSchedules(
      mergeWeekCalendarDays('2026-08-17', [
        {
          operationDate: '2026-08-17',
          weekday: 0,
          sectorIds: [],
          collectionPointIds: [1],
        },
      ]),
      [
        {
          id: 1,
          collectionPointId: 1,
          pointCode: 'CNT-001',
          visitsPerWeek: 2,
          weekdays: [0, 2],
          isExtraVisit: false,
          effectiveFrom: '2026-01-01',
        },
        {
          id: 2,
          collectionPointId: 2,
          pointCode: 'CNT-002',
          visitsPerWeek: 1,
          weekdays: [1],
          isExtraVisit: false,
          effectiveFrom: '2026-01-01',
        },
      ],
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.pointCode).toBe('CNT-002');
  });
});
