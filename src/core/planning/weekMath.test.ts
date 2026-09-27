import { describe, expect, it } from 'vitest';
import { addWeeksToMonday, mondayIso } from './isoDate';
import { mondayOfDate, shiftWeek, weekDaysFromMonday } from './dailyPlanningUx';
import { addDaysToIso } from './weeklyPlanCalendar';

/**
 * El cálculo de semanas debe operar en fecha local para coincidir con el backend
 * (`week_range` usa el lunes como inicio). Antes se mezclaba parseo UTC con getters
 * locales y, en zonas detrás de UTC, el lunes de una fecha se corría varios días.
 */
describe('week math — alineado con el backend (lunes)', () => {
  it('mantiene el lunes y retrocede desde el domingo', () => {
    expect(mondayIso('2026-09-14')).toBe('2026-09-14');
    expect(mondayIso('2026-09-20')).toBe('2026-09-14');
    expect(mondayOfDate('2026-09-14')).toBe('2026-09-14');
  });

  it('suma semanas y días de forma exacta', () => {
    expect(addWeeksToMonday('2026-09-14', 1)).toBe('2026-09-21');
    expect(addWeeksToMonday('2026-09-14', -1)).toBe('2026-09-07');
    expect(shiftWeek('2026-09-14', -1)).toBe('2026-09-07');
    expect(addDaysToIso('2026-09-14', 6)).toBe('2026-09-20');
  });

  it('construye la semana lun–dom', () => {
    expect(weekDaysFromMonday('2026-09-14')).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });
});
