import type { AcoConvergencePoint } from '../../data/types/simulation';
import type { DemoAcoConvergencePoint } from './demoAcoEngine';

/** Adapta la convergencia del laberinto al contrato del chart de simulación. */
export function demoConvergenceToChartPoints(
  convergence: DemoAcoConvergencePoint[],
): AcoConvergencePoint[] {
  return convergence.map((point) => ({
    iteration: point.iteration,
    bestDistanceKm: sanitizeDemoCost(point.bestCost),
    iterationBestDistanceKm: sanitizeDemoCost(point.iterationBestCost),
  }));
}

function sanitizeDemoCost(cost: number): number {
  return Number.isFinite(cost) ? cost : 0;
}
