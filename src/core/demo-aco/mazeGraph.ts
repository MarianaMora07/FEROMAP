import type {
  MazeCell,
  MazeDefinition,
  MazeGraph,
  MazeGraphEdge,
  MazePoint,
  MazeValidationIssue,
  MazeValidationResult,
} from './mazeTypes';
import { MAZE_CARDINAL_DELTAS, MAZE_OPPOSITE_WALL } from './mazeTypes';

export function mazeNodeId(width: number, point: MazePoint): number {
  return point.y * width + point.x;
}

export function mazePointFromId(width: number, nodeId: number): MazePoint {
  return { x: nodeId % width, y: Math.floor(nodeId / width) };
}

export function isInsideMaze(maze: MazeDefinition, point: MazePoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < maze.width && point.y < maze.height;
}

export function getMazeCell(maze: MazeDefinition, point: MazePoint): MazeCell | undefined {
  if (!isInsideMaze(maze, point)) return undefined;
  return maze.cells[mazeNodeId(maze.width, point)];
}

export function pointsEqual(a: MazePoint, b: MazePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Vecinos alcanzables en 4 direcciones (sin diagonal). */
export function getMazeNeighbors(maze: MazeDefinition, point: MazePoint): MazePoint[] {
  const cell = getMazeCell(maze, point);
  if (!cell) return [];

  const neighbors: MazePoint[] = [];
  for (const delta of MAZE_CARDINAL_DELTAS) {
    if (cell.walls[delta.wall]) continue;
    const next = { x: point.x + delta.dx, y: point.y + delta.dy };
    if (!isInsideMaze(maze, next)) continue;
    neighbors.push(next);
  }
  return neighbors;
}

export function buildMazeGraph(maze: MazeDefinition): MazeGraph {
  const nodes = maze.cells.map((cell) => ({
    id: mazeNodeId(maze.width, cell),
    x: cell.x,
    y: cell.y,
  }));

  const edges: MazeGraphEdge[] = [];
  for (const cell of maze.cells) {
    const from = mazeNodeId(maze.width, cell);
    for (const neighbor of getMazeNeighbors(maze, cell)) {
      const to = mazeNodeId(maze.width, neighbor);
      if (from < to) {
        edges.push({ from, to, cost: 1 });
      }
    }
  }

  return {
    width: maze.width,
    height: maze.height,
    nodes,
    edges,
    startNodeId: mazeNodeId(maze.width, maze.start),
    endNodeId: mazeNodeId(maze.width, maze.end),
  };
}

export function isValidMazePath(maze: MazeDefinition, path: MazePoint[]): boolean {
  if (path.length === 0) return false;
  if (!pointsEqual(path[0], maze.start)) return false;
  if (!pointsEqual(path[path.length - 1], maze.end)) return false;

  for (let index = 1; index < path.length; index++) {
    const prev = path[index - 1]!;
    const current = path[index]!;
    const neighbors = getMazeNeighbors(maze, prev);
    if (!neighbors.some((neighbor) => pointsEqual(neighbor, current))) {
      return false;
    }
  }
  return true;
}

export function mazePathStepCost(maze: MazeDefinition, path: MazePoint[]): number {
  if (!isValidMazePath(maze, path)) return Infinity;
  return Math.max(0, path.length - 1);
}

/** BFS — camino más corto en pasos (costo uniforme). */
export function findShortestMazePath(maze: MazeDefinition): MazePoint[] | null {
  const startId = mazeNodeId(maze.width, maze.start);
  const endId = mazeNodeId(maze.width, maze.end);
  const queue: number[] = [startId];
  const visited = new Set<number>([startId]);
  const previous = new Map<number, number>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === endId) break;

    const point = mazePointFromId(maze.width, currentId);
    for (const neighbor of getMazeNeighbors(maze, point)) {
      const neighborId = mazeNodeId(maze.width, neighbor);
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      previous.set(neighborId, currentId);
      queue.push(neighborId);
    }
  }

  if (!visited.has(endId)) return null;

  const pathIds: number[] = [];
  let cursor: number | undefined = endId;
  while (cursor !== undefined) {
    pathIds.push(cursor);
    if (cursor === startId) break;
    cursor = previous.get(cursor);
  }

  if (pathIds[pathIds.length - 1] !== startId) return null;
  pathIds.reverse();
  return pathIds.map((id) => mazePointFromId(maze.width, id));
}

export function validateMazeDefinition(maze: MazeDefinition): MazeValidationResult {
  const issues: MazeValidationIssue[] = [];

  const expectedCells = maze.width * maze.height;
  if (maze.cells.length !== expectedCells) {
    issues.push({
      code: 'cell_count',
      message: `Se esperaban ${expectedCells} celdas, hay ${maze.cells.length}`,
    });
  }

  let startCount = 0;
  let endCount = 0;

  for (const cell of maze.cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= maze.width || cell.y >= maze.height) {
      issues.push({
        code: 'cell_out_of_bounds',
        message: `Celda (${cell.x}, ${cell.y}) fuera de la grilla ${maze.width}×${maze.height}`,
      });
    }

    const expectedId = mazeNodeId(maze.width, cell);
    const actualId = mazeNodeId(maze.width, { x: cell.x, y: cell.y });
    const index = maze.cells.indexOf(cell);
    if (index !== actualId) {
      issues.push({
        code: 'cell_order',
        message: `Celda (${cell.x}, ${cell.y}) en índice ${index}, se esperaba ${actualId}`,
      });
    }

    if (cell.isStart) startCount += 1;
    if (cell.isEnd) endCount += 1;
  }

  if (startCount !== 1) {
    issues.push({
      code: 'start_count',
      message: `Debe haber exactamente una celda de inicio (encontradas: ${startCount})`,
    });
  }

  if (endCount !== 1) {
    issues.push({
      code: 'end_count',
      message: `Debe haber exactamente una celda de fin (encontradas: ${endCount})`,
    });
  }

  const startCell = getMazeCell(maze, maze.start);
  const endCell = getMazeCell(maze, maze.end);
  if (!startCell?.isStart) {
    issues.push({
      code: 'start_marker',
      message: `La celda start (${maze.start.x}, ${maze.start.y}) no está marcada como inicio`,
    });
  }
  if (!endCell?.isEnd) {
    issues.push({
      code: 'end_marker',
      message: `La celda end (${maze.end.x}, ${maze.end.y}) no está marcada como fin`,
    });
  }

  if (pointsEqual(maze.start, maze.end)) {
    issues.push({
      code: 'start_equals_end',
      message: 'Inicio y fin no pueden ser la misma celda',
    });
  }

  for (const cell of maze.cells) {
    for (const delta of MAZE_CARDINAL_DELTAS) {
      const neighbor = { x: cell.x + delta.dx, y: cell.y + delta.dy };
      if (!isInsideMaze(maze, neighbor)) {
        if (!cell.walls[delta.wall]) {
          issues.push({
            code: 'border_open',
            message: `Celda (${cell.x}, ${cell.y}) abre hacia ${delta.wall} fuera del borde`,
          });
        }
        continue;
      }

      const neighborCell = getMazeCell(maze, neighbor)!;
      const opposite = MAZE_OPPOSITE_WALL[delta.wall];
      if (cell.walls[delta.wall] !== neighborCell.walls[opposite]) {
        issues.push({
          code: 'wall_mismatch',
          message: `Pared inconsistente entre (${cell.x}, ${cell.y}) y (${neighbor.x}, ${neighbor.y})`,
        });
      }
    }
  }

  const shortest = findShortestMazePath(maze);
  if (!shortest) {
    issues.push({
      code: 'no_path',
      message: 'No existe camino válido entre inicio y fin',
    });
  } else {
    const shortestCost = mazePathStepCost(maze, shortest);
    if (shortestCost !== maze.knownOptimalCost) {
      issues.push({
        code: 'optimal_cost_mismatch',
        message: `Costo óptimo documentado ${maze.knownOptimalCost}, BFS encontró ${shortestCost}`,
      });
    }

    if (!isValidMazePath(maze, maze.knownOptimalPath)) {
      issues.push({
        code: 'known_path_invalid',
        message: 'knownOptimalPath no es un camino válido',
      });
    } else if (mazePathStepCost(maze, maze.knownOptimalPath) !== maze.knownOptimalCost) {
      issues.push({
        code: 'known_path_cost',
        message: `knownOptimalPath tiene costo distinto a knownOptimalCost`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidMazeDefinition(maze: MazeDefinition): void {
  const result = validateMazeDefinition(maze);
  if (!result.valid) {
    const detail = result.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Laberinto "${maze.id}" inválido: ${detail}`);
  }
}
