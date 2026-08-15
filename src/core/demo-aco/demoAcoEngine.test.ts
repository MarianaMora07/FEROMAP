import { describe, expect, it } from 'vitest';
import {
  createDemoAcoEngine,
  createSeededRng,
  demoAcoSnapshotsMatch,
  runDemoAco,
  stepDemoAco,
} from './demoAcoEngine';
import { MAZE_SIMPLE } from './mazes';

describe('demoAcoEngine', () => {
  it('createSeededRng es determinista con la misma semilla', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const valuesA = Array.from({ length: 5 }, () => a());
    const valuesB = Array.from({ length: 5 }, () => b());
    expect(valuesA).toEqual(valuesB);
  });

  it('stepDemoAco avanza iteraciones hasta done', () => {
    const engine = createDemoAcoEngine(MAZE_SIMPLE, {
      ants: 4,
      iterations: 3,
      patience: 0,
      seed: 7,
      includeInitialSnapshot: true,
    });

    const first = stepDemoAco(engine);
    expect(first).not.toBeNull();
    expect(first!.iteration).toBe(1);
    expect(first!.ants).toHaveLength(4);
    expect(engine.done).toBe(false);

    stepDemoAco(engine);
    const third = stepDemoAco(engine);
    expect(third!.iteration).toBe(3);
    expect(third!.done).toBe(true);

    expect(stepDemoAco(engine)).toBeNull();
  });

  it('runDemoAco produce snapshots reproducibles con la misma semilla', () => {
    const opts = {
      ants: 8,
      iterations: 15,
      patience: 0,
      seed: 42,
      includeInitialSnapshot: true,
    };

    const runA = runDemoAco(MAZE_SIMPLE, opts);
    const runB = runDemoAco(MAZE_SIMPLE, opts);

    expect(demoAcoSnapshotsMatch(runA.snapshots, runB.snapshots)).toBe(true);
    expect(runA.final.bestCost).toBe(runB.final.bestCost);
    expect(runA.convergence.length).toBe(15);
  });

  it('en laberinto simple converge al costo óptimo conocido', () => {
    const result = runDemoAco(MAZE_SIMPLE, {
      ants: 16,
      iterations: 40,
      patience: 8,
      seed: 42,
      includeInitialSnapshot: false,
    });

    expect(result.final.bestCost).toBe(MAZE_SIMPLE.knownOptimalCost);
    expect(result.final.bestPath).toEqual(MAZE_SIMPLE.knownOptimalPath);
    expect(result.final.bestPath.length).toBe(MAZE_SIMPLE.knownOptimalPath.length);
  });

  it('registra feromonas y hormigas en cada snapshot de iteración', () => {
    const result = runDemoAco(MAZE_SIMPLE, {
      ants: 6,
      iterations: 2,
      patience: 0,
      seed: 1,
      includeInitialSnapshot: true,
    });

    expect(result.snapshots[0]!.iteration).toBe(0);
    expect(result.snapshots[0]!.ants).toHaveLength(0);
    expect(result.snapshots[0]!.pheromone.length).toBe(MAZE_SIMPLE.cells.length);

    const afterFirst = result.snapshots[1]!;
    expect(afterFirst.ants.every((ant) => ant.path.length >= 1)).toBe(true);
    expect(afterFirst.pheromone[0]!.length).toBe(MAZE_SIMPLE.cells.length);
  });

  it('puede detenerse antes por paciencia', () => {
    const result = runDemoAco(MAZE_SIMPLE, {
      ants: 12,
      iterations: 100,
      patience: 3,
      seed: 99,
      includeInitialSnapshot: false,
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.iterationsRun).toBeLessThan(100);
    expect(result.final.bestCost).toBe(MAZE_SIMPLE.knownOptimalCost);
  });
});
