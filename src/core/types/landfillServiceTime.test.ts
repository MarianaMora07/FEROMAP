import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANDFILL_UNLOAD_SECONDS,
  DEFAULT_SHIFT_BUDGET_SECONDS,
  buildLandfillRouteBreakdown,
  canFitStopInShift,
  landfillNodeIndex,
  landfillUnloadSeconds,
  routeOperationalElapsedSeconds,
  shiftBudgetSeconds,
  shiftUtilizationPct,
} from './landfillServiceTime';

describe('landfillServiceTime contract', () => {
  it('landfill node index is N+1', () => {
    expect(landfillNodeIndex(20)).toBe(21);
  });

  it('default unload is 15 min = 900 s', () => {
    expect(landfillUnloadSeconds()).toBe(DEFAULT_LANDFILL_UNLOAD_SECONDS);
    expect(landfillUnloadSeconds()).toBe(900);
  });

  it('shift budget 06:00–18:00 is 12 h', () => {
    expect(shiftBudgetSeconds('06:00', '18:00')).toBe(DEFAULT_SHIFT_BUDGET_SECONDS);
    expect(shiftBudgetSeconds()).toBe(43200);
  });

  it('elapsed = travel + paradas + vertederos', () => {
    expect(
      routeOperationalElapsedSeconds(7200, 5, 300, 2),
    ).toBe(10500);
  });

  it('canFitStopInShift respects jornada', () => {
    const budget = shiftBudgetSeconds();
    expect(canFitStopInShift(40000, 1200, 300, budget)).toBe(true);
    expect(canFitStopInShift(43000, 500, 300, budget)).toBe(false);
  });

  it('shiftUtilizationPct caps at 100', () => {
    const budget = shiftBudgetSeconds();
    expect(shiftUtilizationPct(budget * 0.5, budget)).toBe(50);
    expect(shiftUtilizationPct(budget * 2, budget)).toBe(100);
  });

  it('buildLandfillRouteBreakdown includes landfill trips', () => {
    const breakdown = buildLandfillRouteBreakdown({
      travelSeconds: 7200,
      collectionStopCount: 5,
      serviceSecondsPerStop: 300,
      landfillVisitCount: 2,
    });
    expect(breakdown.landfillVisitCount).toBe(2);
    expect(breakdown.unloadSecondsTotal).toBe(1800);
    expect(breakdown.shiftBudgetSeconds).toBe(43200);
    expect(breakdown.elapsedSeconds).toBe(10500);
  });

  it('unload minutes override scales unload seconds', () => {
    expect(landfillUnloadSeconds(20)).toBe(1200);
    expect(
      routeOperationalElapsedSeconds(1000, 2, 300, 2, { unloadMinutes: 20 }),
    ).toBe(1000 + 600 + 2400);
  });
});
