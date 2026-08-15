import { describe, expect, it } from 'vitest';
import { demoConvergenceToChartPoints } from './demoConvergence';

describe('demoConvergence', () => {
  it('adapta costos del laberinto al contrato del chart', () => {
    const points = demoConvergenceToChartPoints([
      { iteration: 1, bestCost: 8, iterationBestCost: 10 },
      { iteration: 2, bestCost: 6, iterationBestCost: 7 },
    ]);

    expect(points).toEqual([
      { iteration: 1, bestDistanceKm: 8, iterationBestDistanceKm: 10 },
      { iteration: 2, bestDistanceKm: 6, iterationBestDistanceKm: 7 },
    ]);
  });

  it('normaliza costos no finitos a cero', () => {
    const points = demoConvergenceToChartPoints([
      { iteration: 0, bestCost: Infinity, iterationBestCost: Infinity },
    ]);
    expect(points[0]?.bestDistanceKm).toBe(0);
    expect(points[0]?.iterationBestDistanceKm).toBe(0);
  });
});
