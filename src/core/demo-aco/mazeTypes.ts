/** Punto en la grilla del laberinto (columna x, fila y). */
export interface MazePoint {
  x: number;
  y: number;
}

/** Paredes perimetrales de una celda (true = hay pared, no se puede cruzar). */
export interface MazeCellWalls {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

export interface MazeCell {
  x: number;
  y: number;
  walls: MazeCellWalls;
  isStart: boolean;
  isEnd: boolean;
}

export type MazePresetId =
  | 'simple'
  | 'complex'
  | 'shortcut'
  | 'dead_ends'
  | 'optimal_vs_suboptimal';

export interface MazeDefinition {
  id: MazePresetId;
  label: string;
  description: string;
  width: number;
  height: number;
  /** Celdas en orden row-major: índice = y * width + x */
  cells: MazeCell[];
  start: MazePoint;
  end: MazePoint;
  /** Costo del camino óptimo en pasos (número de aristas). */
  knownOptimalCost: number;
  /** Camino más corto documentado (incluye inicio y fin). */
  knownOptimalPath: MazePoint[];
}

export interface MazeValidationIssue {
  code: string;
  message: string;
}

export interface MazeValidationResult {
  valid: boolean;
  issues: MazeValidationIssue[];
}

export interface MazeGraphNode {
  id: number;
  x: number;
  y: number;
}

export interface MazeGraphEdge {
  from: number;
  to: number;
  cost: number;
}

export interface MazeGraph {
  width: number;
  height: number;
  nodes: MazeGraphNode[];
  edges: MazeGraphEdge[];
  startNodeId: number;
  endNodeId: number;
}

/** Desplazamiento cardinal sin diagonales. */
export const MAZE_CARDINAL_DELTAS: ReadonlyArray<{ dx: number; dy: number; wall: keyof MazeCellWalls }> = [
  { dx: 0, dy: -1, wall: 'north' },
  { dx: 1, dy: 0, wall: 'east' },
  { dx: 0, dy: 1, wall: 'south' },
  { dx: -1, dy: 0, wall: 'west' },
];

export const MAZE_OPPOSITE_WALL: Record<keyof MazeCellWalls, keyof MazeCellWalls> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};
