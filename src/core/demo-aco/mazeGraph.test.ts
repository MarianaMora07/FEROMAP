import { describe, expect, it } from 'vitest';
import {
  DEMO_MAZE_PRESETS,
  MAZE_DEAD_ENDS,
  MAZE_OPTIMAL_VS_SUBOPTIMAL,
  MAZE_OPTIMAL_VS_SUBOPTIMAL_LONG_PATH,
  MAZE_SHORTCUT,
  MAZE_SHORTCUT_SUBOPTIMAL_PATH,
  MAZE_SIMPLE,
  getDemoMazePreset,
} from './mazes';
import {
  buildMazeGraph,
  findShortestMazePath,
  getMazeNeighbors,
  isValidMazePath,
  mazeNodeId,
  mazePathStepCost,
  mazePointFromId,
  pointsEqual,
  validateMazeDefinition,
} from './mazeGraph';

describe('mazeGraph', () => {
  it('valida todos los presets al cargar el módulo', () => {
    for (const maze of DEMO_MAZE_PRESETS) {
      const result = validateMazeDefinition(maze);
      expect(result.valid, result.issues.map((i) => i.message).join('; ')).toBe(true);
    }
  });

  describe('MAZE_SIMPLE', () => {
    const maze = MAZE_SIMPLE;

    it('tiene solución conocida de costo 4', () => {
      expect(maze.knownOptimalCost).toBe(4);
      expect(isValidMazePath(maze, maze.knownOptimalPath)).toBe(true);
      expect(mazePathStepCost(maze, maze.knownOptimalPath)).toBe(4);
    });

    it('solo permite movimiento horizontal en el corredor (sin diagonal)', () => {
      const center = { x: 2, y: 1 };
      const neighbors = getMazeNeighbors(maze, center);
      expect(neighbors).toHaveLength(2);
      expect(neighbors.some((p) => pointsEqual(p, { x: 1, y: 1 }))).toBe(true);
      expect(neighbors.some((p) => pointsEqual(p, { x: 3, y: 1 }))).toBe(true);
      expect(neighbors.some((p) => pointsEqual(p, { x: 2, y: 0 }))).toBe(false);
      expect(neighbors.some((p) => pointsEqual(p, { x: 2, y: 2 }))).toBe(false);
    });

    it('BFS coincide con el camino documentado', () => {
      const shortest = findShortestMazePath(maze);
      expect(shortest).not.toBeNull();
      expect(mazePathStepCost(maze, shortest!)).toBe(maze.knownOptimalCost);
      expect(shortest).toEqual(maze.knownOptimalPath);
    });
  });

  describe('MAZE_SHORTCUT', () => {
    const maze = MAZE_SHORTCUT;

    it('el atajo es más corto que el recorrido por el borde', () => {
      const shortest = findShortestMazePath(maze)!;

      expect(isValidMazePath(maze, MAZE_SHORTCUT_SUBOPTIMAL_PATH)).toBe(true);
      expect(mazePathStepCost(maze, MAZE_SHORTCUT_SUBOPTIMAL_PATH)).toBeGreaterThan(
        maze.knownOptimalCost,
      );
      expect(mazePathStepCost(maze, shortest)).toBe(maze.knownOptimalCost);
      expect(maze.knownOptimalCost).toBe(10);
    });

    it('knownOptimalPath es el camino más corto', () => {
      const shortest = findShortestMazePath(maze);
      expect(shortest).toEqual(maze.knownOptimalPath);
    });
  });

  describe('MAZE_DEAD_ENDS', () => {
    const maze = MAZE_DEAD_ENDS;

    it('las ramas falsas no conectan con la meta', () => {
      const deadEnd = { x: 2, y: 0 };
      const neighbors = getMazeNeighbors(maze, deadEnd);
      expect(neighbors).toEqual([{ x: 2, y: 1 }]);

      const bottomDeadEnd = { x: 4, y: 4 };
      expect(getMazeNeighbors(maze, bottomDeadEnd)).toEqual([{ x: 4, y: 3 }]);
    });

    it('la troncal es el único camino viable', () => {
      const shortest = findShortestMazePath(maze);
      expect(shortest).toEqual(maze.knownOptimalPath);
      expect(maze.knownOptimalCost).toBe(8);
    });
  });

  describe('MAZE_OPTIMAL_VS_SUBOPTIMAL', () => {
    const maze = MAZE_OPTIMAL_VS_SUBOPTIMAL;

    it('existe un camino largo válido y uno óptimo más corto', () => {
      expect(isValidMazePath(maze, MAZE_OPTIMAL_VS_SUBOPTIMAL_LONG_PATH)).toBe(true);
      expect(mazePathStepCost(maze, MAZE_OPTIMAL_VS_SUBOPTIMAL_LONG_PATH)).toBe(12);
      expect(maze.knownOptimalCost).toBe(10);
      expect(mazePathStepCost(maze, maze.knownOptimalPath)).toBe(10);
    });

    it('BFS encuentra el camino central documentado', () => {
      const shortest = findShortestMazePath(maze);
      expect(shortest).toEqual(maze.knownOptimalPath);
    });
  });

  describe('buildMazeGraph', () => {
    it('genera aristas bidireccionales de costo 1 sin diagonales', () => {
      const maze = MAZE_SIMPLE;
      const graph = buildMazeGraph(maze);
      expect(graph.startNodeId).toBe(mazeNodeId(maze.width, maze.start));
      expect(graph.endNodeId).toBe(mazeNodeId(maze.width, maze.end));

      for (const edge of graph.edges) {
        expect(edge.cost).toBe(1);
        const from = mazePointFromId(graph.width, edge.from);
        const to = mazePointFromId(graph.width, edge.to);
        const manhattan = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
        expect(manhattan).toBe(1);
      }
    });
  });

  describe('getDemoMazePreset', () => {
    it('resuelve presets por id', () => {
      expect(getDemoMazePreset('simple').id).toBe('simple');
      expect(getDemoMazePreset('shortcut').id).toBe('shortcut');
    });

    it('lanza error para id desconocido', () => {
      expect(() => getDemoMazePreset('unknown' as never)).toThrow(/desconocido/);
    });
  });
});
