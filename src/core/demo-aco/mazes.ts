import type { MazeCell, MazeDefinition, MazePoint } from './mazeTypes';
import { findShortestMazePath, assertValidMazeDefinition } from './mazeGraph';

function createWalledGrid(width: number, height: number): MazeCell[] {
  const cells: MazeCell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({
        x,
        y,
        walls: { north: true, east: true, south: true, west: true },
        isStart: false,
        isEnd: false,
      });
    }
  }
  return cells;
}

function cellAt(cells: MazeCell[], width: number, point: MazePoint): MazeCell {
  return cells[point.y * width + point.x]!;
}

function openPassage(cells: MazeCell[], width: number, from: MazePoint, to: MazePoint): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fromCell = cellAt(cells, width, from);
  const toCell = cellAt(cells, width, to);

  if (dx === 1 && dy === 0) {
    fromCell.walls.east = false;
    toCell.walls.west = false;
    return;
  }
  if (dx === -1 && dy === 0) {
    fromCell.walls.west = false;
    toCell.walls.east = false;
    return;
  }
  if (dx === 0 && dy === 1) {
    fromCell.walls.south = false;
    toCell.walls.north = false;
    return;
  }
  if (dx === 0 && dy === -1) {
    fromCell.walls.north = false;
    toCell.walls.south = false;
    return;
  }

  throw new Error(`openPassage: celdas no adyacentes (${from.x},${from.y}) → (${to.x},${to.y})`);
}

function openPath(cells: MazeCell[], width: number, path: MazePoint[]): void {
  for (let index = 1; index < path.length; index++) {
    openPassage(cells, width, path[index - 1]!, path[index]!);
  }
}

function markStartEnd(cells: MazeCell[], width: number, start: MazePoint, end: MazePoint): void {
  cellAt(cells, width, start).isStart = true;
  cellAt(cells, width, end).isEnd = true;
}

function horizontalLine(y: number, xFrom: number, xTo: number): MazePoint[] {
  const points: MazePoint[] = [];
  const step = xFrom <= xTo ? 1 : -1;
  for (let x = xFrom; x !== xTo + step; x += step) {
    points.push({ x, y });
  }
  return points;
}

function verticalLine(x: number, yFrom: number, yTo: number): MazePoint[] {
  const points: MazePoint[] = [];
  const step = yFrom <= yTo ? 1 : -1;
  for (let y = yFrom; y !== yTo + step; y += step) {
    points.push({ x, y });
  }
  return points;
}

function chainPaths(...segments: MazePoint[][]): MazePoint[][] {
  return segments;
}

function concatPoints(...segments: MazePoint[][]): MazePoint[] {
  const points: MazePoint[] = [];
  for (const segment of segments) {
    for (const point of segment) {
      const last = points[points.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        points.push(point);
      }
    }
  }
  return points;
}

/** Corredor serpenteante que recorre casi toda la grilla. */
function labyrinthMainCorridor(width: number, height: number): MazePoint[] {
  const segments: MazePoint[][] = [];
  for (let y = height - 1; y > 0; y -= 1) {
    const rowFromBottom = height - 1 - y;
    if (rowFromBottom % 2 === 0) {
      segments.push(horizontalLine(y, 0, width - 2));
      segments.push(verticalLine(width - 2, y, y - 1));
    } else {
      segments.push(horizontalLine(y, width - 2, 1));
      segments.push(verticalLine(1, y, y - 1));
    }
  }
  segments.push(horizontalLine(0, width - 2, width - 1));
  return concatPoints(...segments);
}

function buildMazeFromPassages(
  id: MazeDefinition['id'],
  label: string,
  description: string,
  width: number,
  height: number,
  start: MazePoint,
  end: MazePoint,
  passages: MazePoint[][],
): MazeDefinition {
  const cells = createWalledGrid(width, height);
  for (const path of passages) {
    openPath(cells, width, path);
  }
  markStartEnd(cells, width, start, end);

  const draft: MazeDefinition = {
    id,
    label,
    description,
    width,
    height,
    cells,
    start,
    end,
    knownOptimalCost: 0,
    knownOptimalPath: [],
  };

  const shortest = findShortestMazePath(draft);
  if (!shortest) {
    throw new Error(`Laberinto "${id}" sin camino entre inicio y fin`);
  }

  const maze: MazeDefinition = {
    ...draft,
    knownOptimalPath: shortest,
    knownOptimalCost: shortest.length - 1,
  };

  assertValidMazeDefinition(maze);
  return maze;
}

/** Corredor recto — un solo camino sin bifurcaciones. */
export const MAZE_SIMPLE: MazeDefinition = buildMazeFromPassages(
  'simple',
  'Corredor simple',
  'Un solo camino sin bifurcaciones: el ACO solo debe seguir el pasillo.',
  5,
  3,
  { x: 0, y: 1 },
  { x: 4, y: 1 },
  [[{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]],
);

/**
 * Atajo por la fila central vs recorrido largo por el borde superior.
 * Óptimo: bajar una fila y cruzar en horizontal.
 */
export const MAZE_SHORTCUT: MazeDefinition = buildMazeFromPassages(
  'shortcut',
  'Con atajo',
  'Hay un camino largo por el perímetro superior y un atajo central que el ACO debería favorecer con feromonas.',
  10,
  3,
  { x: 0, y: 1 },
  { x: 9, y: 2 },
  [
    // Atajo óptimo (fila central inferior)
    [
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 6, y: 2 },
      { x: 7, y: 2 },
      { x: 8, y: 2 },
      { x: 9, y: 2 },
    ],
    // Recorrido largo por el borde superior
    [
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 },
      { x: 7, y: 0 },
      { x: 8, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 1 },
      { x: 9, y: 2 },
    ],
  ],
);

/** Ramas con callejones sin salida que desvían hormigas antes de converger. */
export const MAZE_DEAD_ENDS: MazeDefinition = buildMazeFromPassages(
  'dead_ends',
  'Callejones sin salida',
  'Varias ramas falsas: las hormigas exploran, fallan y la feromona se concentra en el único camino viable.',
  9,
  5,
  { x: 0, y: 2 },
  { x: 8, y: 2 },
  [
    // Troncal principal
    [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 6, y: 2 },
      { x: 7, y: 2 },
      { x: 8, y: 2 },
    ],
    // Callejón superior en columna 2
    [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 0 }],
    // Callejón inferior en columna 4
    [{ x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 }],
    // Callejón superior en columna 6
    [{ x: 6, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 0 }],
    // Bifurcación falsa en columna 3 (solo sube)
    [{ x: 3, y: 2 }, { x: 3, y: 1 }],
  ],
);

/**
 * Pasillo superior largo vs puerta central corta.
 * Óptimo: pasar por la fila central; subóptimo: rodear por arriba.
 */
export const MAZE_OPTIMAL_VS_SUBOPTIMAL: MazeDefinition = buildMazeFromPassages(
  'optimal_vs_suboptimal',
  'Óptimo vs subóptimo',
  'Un recorrido largo por arriba compite con una puerta central mucho más corta.',
  10,
  3,
  { x: 0, y: 1 },
  { x: 9, y: 2 },
  [
    // Ruta larga por el borde superior
    [
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 },
      { x: 7, y: 0 },
      { x: 8, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 1 },
      { x: 9, y: 2 },
    ],
    // Atajo central (óptimo)
    [
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 6, y: 2 },
      { x: 7, y: 2 },
      { x: 8, y: 2 },
      { x: 9, y: 2 },
    ],
  ],
);

/**
 * Laberinto amplio con recorrido serpenteante, callejones y un rodeo largo por el perímetro.
 */
export const MAZE_COMPLEX: MazeDefinition = buildMazeFromPassages(
  'complex',
  'Laberinto complejo',
  'Grilla 20×14 con pasillo serpenteante, muchas ramas falsas y un rodeo por el borde: ideal para ver exploración paso a paso.',
  20,
  14,
  { x: 0, y: 13 },
  { x: 19, y: 0 },
  chainPaths(
    labyrinthMainCorridor(20, 14),
    verticalLine(0, 13, 10),
    verticalLine(0, 13, 8),
    verticalLine(2, 13, 11),
    verticalLine(4, 12, 9),
    verticalLine(6, 11, 8),
    verticalLine(8, 10, 7),
    verticalLine(10, 9, 6),
    verticalLine(12, 8, 5),
    verticalLine(14, 7, 4),
    verticalLine(16, 6, 3),
    verticalLine(18, 5, 2),
    verticalLine(17, 4, 7),
    verticalLine(15, 5, 8),
    verticalLine(13, 6, 9),
    verticalLine(11, 7, 10),
    verticalLine(9, 8, 11),
    verticalLine(7, 9, 12),
    verticalLine(5, 10, 11),
    verticalLine(3, 11, 12),
    horizontalLine(12, 3, 6),
    horizontalLine(8, 7, 11),
    horizontalLine(4, 10, 14),
    concatPoints(verticalLine(0, 13, 0), horizontalLine(0, 0, 19)),
  ),
);

export const DEMO_MAZE_PRESETS: MazeDefinition[] = [
  MAZE_COMPLEX,
  MAZE_SIMPLE,
  MAZE_SHORTCUT,
  MAZE_DEAD_ENDS,
  MAZE_OPTIMAL_VS_SUBOPTIMAL,
];

export function getDemoMazePreset(id: MazeDefinition['id']): MazeDefinition {
  const maze = DEMO_MAZE_PRESETS.find((preset) => preset.id === id);
  if (!maze) {
    throw new Error(`Laberinto preset desconocido: ${id}`);
  }
  return maze;
}

/** Camino subóptimo documentado para demos (más largo que el óptimo). */
export const MAZE_SHORTCUT_SUBOPTIMAL_PATH: MazePoint[] = [
  { x: 0, y: 1 },
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 6, y: 0 },
  { x: 7, y: 0 },
  { x: 8, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 1 },
  { x: 9, y: 2 },
];

export const MAZE_OPTIMAL_VS_SUBOPTIMAL_LONG_PATH: MazePoint[] = [
  { x: 0, y: 1 },
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 6, y: 0 },
  { x: 7, y: 0 },
  { x: 8, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 1 },
  { x: 9, y: 2 },
];
