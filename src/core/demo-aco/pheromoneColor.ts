/** Azul bajo (poca feromona) — contraste legible sobre celdas claras/oscuras. */
export const PHEROMONE_COLOR_LOW = { r: 29, g: 78, b: 216 } as const;

/** Ámbar alto (mucha feromona) — separado del azul para lectura accesible. */
export const PHEROMONE_COLOR_HIGH = { r: 217, g: 119, b: 6 } as const;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface PheromoneColorRange {
  min: number;
  max: number;
}

const EDGE_BASELINE = 1;

/**
 * Recolecta valores τ en aristas abiertas del laberinto (solo pasillos, no paredes).
 */
export function collectMazeEdgePheromoneValues(
  width: number,
  cells: { x: number; y: number; walls: { north: boolean; east: boolean } }[],
  pheromone: number[][],
): number[] {
  const values: number[] = [];

  for (const cell of cells) {
    const fromId = cell.y * width + cell.x;
    if (!cell.walls.east && cell.x < width - 1) {
      const toId = cell.y * width + cell.x + 1;
      values.push(pheromone[fromId]?.[toId] ?? 0);
    }
    if (!cell.walls.south) {
      const toId = (cell.y + 1) * width + cell.x;
      values.push(pheromone[fromId]?.[toId] ?? 0);
    }
  }

  return values;
}

export function computePheromoneRange(values: number[]): PheromoneColorRange {
  if (values.length === 0) {
    return { min: EDGE_BASELINE, max: EDGE_BASELINE };
  }

  let min = values[0]!;
  let max = values[0]!;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (max - min < 1e-9) {
    return { min, max: min + 1e-6 };
  }

  return { min, max };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function normalizePheromoneValue(value: number, range: PheromoneColorRange): number {
  return clamp01((value - range.min) / (range.max - range.min));
}

export function interpolateRgb(low: RgbColor, high: RgbColor, t: number): RgbColor {
  const ratio = clamp01(t);
  return {
    r: Math.round(low.r + (high.r - low.r) * ratio),
    g: Math.round(low.g + (high.g - low.g) * ratio),
    b: Math.round(low.b + (high.b - low.b) * ratio),
  };
}

export function rgbToCss(color: RgbColor, alpha = 1): string {
  if (alpha >= 1) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/** Mapea intensidad de feromona a color (azul → ámbar), sin saturar en el rango dado. */
export function pheromoneToRgb(value: number, range: PheromoneColorRange): RgbColor {
  const t = normalizePheromoneValue(value, range);
  return interpolateRgb(PHEROMONE_COLOR_LOW, PHEROMONE_COLOR_HIGH, t);
}

export function pheromoneToCss(value: number, range: PheromoneColorRange, alpha = 0.96): string {
  return rgbToCss(pheromoneToRgb(value, range), alpha);
}

/** Grosor de línea según intensidad (mínimo visible, máximo moderado). */
export function pheromoneLineWidth(value: number, range: PheromoneColorRange, cellSize: number): number {
  const t = normalizePheromoneValue(value, range);
  return Math.max(2.5, cellSize * 0.1 + t * cellSize * 0.16);
}
