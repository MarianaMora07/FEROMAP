import { describe, expect, it } from 'vitest';
import {
  computePheromoneRange,
  normalizePheromoneValue,
  pheromoneToRgb,
  PHEROMONE_COLOR_HIGH,
  PHEROMONE_COLOR_LOW,
} from './pheromoneColor';

describe('pheromoneColor', () => {
  it('mapea mínimo a azul y máximo a ámbar', () => {
    const range = { min: 1, max: 3 };
    const low = pheromoneToRgb(1, range);
    const high = pheromoneToRgb(3, range);

    expect(low.r).toBe(PHEROMONE_COLOR_LOW.r);
    expect(low.g).toBe(PHEROMONE_COLOR_LOW.g);
    expect(low.b).toBe(PHEROMONE_COLOR_LOW.b);

    expect(high.r).toBe(PHEROMONE_COLOR_HIGH.r);
    expect(high.g).toBe(PHEROMONE_COLOR_HIGH.g);
    expect(high.b).toBe(PHEROMONE_COLOR_HIGH.b);
  });

  it('normaliza valores dentro del rango observado', () => {
    const range = computePheromoneRange([1, 2, 4]);
    expect(normalizePheromoneValue(1, range)).toBe(0);
    expect(normalizePheromoneValue(4, range)).toBe(1);
    expect(normalizePheromoneValue(2.5, range)).toBeCloseTo(0.5);
  });

  it('evita rango cero cuando todos los valores son iguales', () => {
    const range = computePheromoneRange([2, 2, 2]);
    expect(range.max).toBeGreaterThan(range.min);
    expect(normalizePheromoneValue(2, range)).toBe(0);
  });
});
