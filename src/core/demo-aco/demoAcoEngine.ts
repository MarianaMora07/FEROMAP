import type { MazeDefinition, MazePoint } from './mazeTypes';
import {
  DEMO_ACO_ALPHA,
  DEMO_ACO_BETA,
  DEMO_ACO_DEPOSIT_Q,
  DEMO_ACO_PATIENCE,
  DEMO_ACO_RHO,
} from './demoAcoParams';
import {
  buildMazeGraph,
  getMazeNeighbors,
  mazeNodeId,
  mazePointFromId,
  pointsEqual,
} from './mazeGraph';
import type { MazeGraph } from './mazeTypes';

export interface DemoAcoAntSnapshot {
  id: number;
  path: MazePoint[];
  cost: number;
  /** Llegó a la meta en esta construcción. */
  completed: boolean;
}

export interface DemoAcoConvergencePoint {
  iteration: number;
  bestCost: number;
  iterationBestCost: number;
}

export interface DemoAcoSnapshot {
  iteration: number;
  ants: DemoAcoAntSnapshot[];
  /** Copia de la matriz de feromonas τ[i][j] (nodos × nodos). */
  pheromone: number[][];
  bestPath: MazePoint[];
  bestCost: number;
  iterationBestPath: MazePoint[];
  iterationBestCost: number;
  improved: boolean;
  stoppedEarly: boolean;
  done: boolean;
}

export interface DemoAcoOptions {
  ants?: number;
  iterations?: number;
  patience?: number;
  seed?: number;
  alpha?: number;
  beta?: number;
  rho?: number;
  depositQ?: number;
  /** Si true, incluye snapshot inicial (iteración 0) antes del primer ciclo. */
  includeInitialSnapshot?: boolean;
}

export interface ResolvedDemoAcoOptions {
  ants: number;
  iterations: number;
  patience: number;
  seed: number;
  alpha: number;
  beta: number;
  rho: number;
  depositQ: number;
  includeInitialSnapshot: boolean;
}

export interface DemoAcoRunResult {
  snapshots: DemoAcoSnapshot[];
  final: DemoAcoSnapshot;
  stoppedEarly: boolean;
  iterationsRun: number;
  convergence: DemoAcoConvergencePoint[];
}

export interface DemoAcoEngine {
  maze: MazeDefinition;
  graph: MazeGraph;
  options: ResolvedDemoAcoOptions;
  snapshots: DemoAcoSnapshot[];
  done: boolean;
  step: () => DemoAcoSnapshot | null;
}

const GRID_EDGE_COST = 1;

function resolveOptions(opts?: DemoAcoOptions): ResolvedDemoAcoOptions {
  return {
    ants: opts?.ants ?? 12,
    iterations: opts?.iterations ?? 30,
    patience: opts?.patience ?? DEMO_ACO_PATIENCE,
    seed: opts?.seed ?? 42,
    alpha: opts?.alpha ?? DEMO_ACO_ALPHA,
    beta: opts?.beta ?? DEMO_ACO_BETA,
    rho: opts?.rho ?? DEMO_ACO_RHO,
    depositQ: opts?.depositQ ?? DEMO_ACO_DEPOSIT_Q,
    includeInitialSnapshot: opts?.includeInitialSnapshot ?? true,
  };
}

/** PRNG determinista (Mulberry32). */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clonePheromone(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

export function clonePheromoneMatrix(matrix: number[][]): number[][] {
  return clonePheromone(matrix);
}

function initPheromoneMatrixInternal(nodeCount: number): number[][] {
  return Array.from({ length: nodeCount }, () =>
    Array.from({ length: nodeCount }, () => 1 / GRID_EDGE_COST),
  );
}

export function initPheromoneMatrix(nodeCount: number): number[][] {
  return initPheromoneMatrixInternal(nodeCount);
}

function nodePathToPoints(width: number, nodePath: number[]): MazePoint[] {
  return nodePath.map((id) => mazePointFromId(width, id));
}

export function resolveDemoAcoOptions(opts?: DemoAcoOptions): ResolvedDemoAcoOptions {
  return resolveOptions(opts);
}

export function pickCandidate(
  rng: () => number,
  currentId: number,
  candidates: number[],
  pheromone: number[][],
  alpha: number,
  beta: number,
): number {
  const weights = candidates.map((candidateId) => {
    const tau = pheromone[currentId][candidateId] ** alpha;
    const eta = (1 / GRID_EDGE_COST) ** beta;
    return tau * eta;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return candidates[Math.floor(rng() * candidates.length)]!;
  }

  const threshold = rng() * total;
  let accumulated = 0;
  for (let index = 0; index < candidates.length; index++) {
    accumulated += weights[index]!;
    if (accumulated >= threshold) {
      return candidates[index]!;
    }
  }
  return candidates[candidates.length - 1]!;
}

function constructAntPath(
  maze: MazeDefinition,
  pheromone: number[][],
  rng: () => number,
  startNodeId: number,
  endNodeId: number,
  alpha: number,
  beta: number,
): { nodePath: number[]; path: MazePoint[]; cost: number; completed: boolean } {
  const width = maze.width;
  const visited = new Set<number>([startNodeId]);
  const nodePath: number[] = [startNodeId];

  while (nodePath[nodePath.length - 1] !== endNodeId) {
    if (nodePath.length > maze.cells.length) {
      return {
        nodePath,
        path: nodePathToPoints(width, nodePath),
        cost: Infinity,
        completed: false,
      };
    }

    const currentId = nodePath[nodePath.length - 1]!;
    const currentPoint = mazePointFromId(width, currentId);
    const neighborPoints = getMazeNeighbors(maze, currentPoint);
    const candidates = neighborPoints
      .map((point) => mazeNodeId(width, point))
      .filter((id) => !visited.has(id));

    if (candidates.length === 0) {
      return {
        nodePath,
        path: nodePathToPoints(width, nodePath),
        cost: Infinity,
        completed: false,
      };
    }

    const nextId = pickCandidate(rng, currentId, candidates, pheromone, alpha, beta);
    nodePath.push(nextId);
    visited.add(nextId);
  }

  return {
    nodePath,
    path: nodePathToPoints(width, nodePath),
    cost: nodePath.length - 1,
    completed: true,
  };
}

export function evaporatePheromone(pheromone: number[][], rho: number): void {
  const factor = 1 - rho;
  for (let i = 0; i < pheromone.length; i++) {
    for (let j = 0; j < pheromone[i]!.length; j++) {
      pheromone[i]![j] *= factor;
    }
  }
}

export function depositPheromone(
  pheromone: number[][],
  nodePath: number[],
  cost: number,
  depositQ: number,
): void {
  if (!Number.isFinite(cost) || cost <= 0 || nodePath.length < 2) return;
  const deposit = depositQ / cost;
  for (let index = 0; index < nodePath.length - 1; index++) {
    const from = nodePath[index]!;
    const to = nodePath[index + 1]!;
    pheromone[from][to] += deposit;
  }
}

function buildSnapshot(
  iteration: number,
  maze: MazeDefinition,
  pheromone: number[][],
  ants: DemoAcoAntSnapshot[],
  bestPath: MazePoint[],
  bestCost: number,
  iterationBestPath: MazePoint[],
  iterationBestCost: number,
  improved: boolean,
  stoppedEarly: boolean,
  done: boolean,
): DemoAcoSnapshot {
  return {
    iteration,
    ants,
    pheromone: clonePheromone(pheromone),
    bestPath: [...bestPath],
    bestCost,
    iterationBestPath: [...iterationBestPath],
    iterationBestCost,
    improved,
    stoppedEarly,
    done,
  };
}

function createInitialSnapshot(maze: MazeDefinition, pheromone: number[][]): DemoAcoSnapshot {
  return createInitialSnapshotState(maze, pheromone);
}

export function createInitialSnapshotState(maze: MazeDefinition, pheromone: number[][]): DemoAcoSnapshot {
  const startPath = [maze.start];
  return buildSnapshot(
    0,
    maze,
    pheromone,
    [],
    startPath,
    Infinity,
    startPath,
    Infinity,
    false,
    false,
    false,
  );
}

export function createDemoAcoEngine(maze: MazeDefinition, opts?: DemoAcoOptions): DemoAcoEngine {
  const options = resolveOptions(opts);
  const graph = buildMazeGraph(maze);
  const nodeCount = maze.cells.length;
  const pheromone = initPheromoneMatrixInternal(nodeCount);
  const rng = createSeededRng(options.seed);

  let iteration = 0;
  let bestNodePath = [graph.startNodeId];
  let bestPath: MazePoint[] = [maze.start];
  let bestCost = Infinity;
  let stallCount = 0;
  let stoppedEarly = false;
  let done = false;

  const snapshots: DemoAcoSnapshot[] = [];
  if (options.includeInitialSnapshot) {
    snapshots.push(createInitialSnapshot(maze, pheromone));
  }

  const engine: DemoAcoEngine = {
    maze,
    graph,
    options,
    snapshots,
    done: false,
    step: () => null as DemoAcoSnapshot | null,
  };

  engine.step = (): DemoAcoSnapshot | null => {
    if (done) {
      engine.done = true;
      return null;
    }

    iteration += 1;
    let iterationBestNodePath: number[] = [];
    let iterationBestCost = Infinity;
    const ants: DemoAcoAntSnapshot[] = [];
    let improved = false;

    for (let antIndex = 0; antIndex < options.ants; antIndex++) {
      const antSeed = options.seed + iteration * options.ants + antIndex;
      const antRng = createSeededRng(antSeed);
      const result = constructAntPath(
        maze,
        pheromone,
        antRng,
        graph.startNodeId,
        graph.endNodeId,
        options.alpha,
        options.beta,
      );

      ants.push({
        id: antIndex,
        path: result.path,
        cost: result.cost,
        completed: result.completed,
      });

      if (result.completed && result.cost < iterationBestCost) {
        iterationBestCost = result.cost;
        iterationBestNodePath = result.nodePath;
      }
    }

    if (
      iterationBestNodePath.length > 0 &&
      Number.isFinite(iterationBestCost) &&
      iterationBestCost < bestCost
    ) {
      bestCost = iterationBestCost;
      bestNodePath = [...iterationBestNodePath];
      bestPath = nodePathToPoints(maze.width, bestNodePath);
      improved = true;
      stallCount = 0;
    } else if (options.patience > 0) {
      stallCount += 1;
      if (stallCount >= options.patience) {
        stoppedEarly = true;
        done = true;
      }
    }

    if (iteration >= options.iterations) {
      done = true;
    }

    evaporatePheromone(pheromone, options.rho);
    if (iterationBestNodePath.length > 0 && Number.isFinite(iterationBestCost)) {
      depositPheromone(pheromone, iterationBestNodePath, iterationBestCost, options.depositQ);
    }

    const iterationBestPath =
      iterationBestNodePath.length > 0
        ? nodePathToPoints(maze.width, iterationBestNodePath)
        : [...bestPath];

    engine.done = done;
    const snapshot = buildSnapshot(
      iteration,
      maze,
      pheromone,
      ants,
      bestPath,
      bestCost,
      iterationBestPath,
      iterationBestCost,
      improved,
      stoppedEarly,
      done,
    );
    snapshots.push(snapshot);
    return snapshot;
  };

  return engine;
}

/** Avanza una iteración del motor ACO. Devuelve `null` si ya terminó. */
export function stepDemoAco(engine: DemoAcoEngine): DemoAcoSnapshot | null {
  return engine.step();
}

export function runDemoAco(maze: MazeDefinition, opts?: DemoAcoOptions): DemoAcoRunResult {
  const engine = createDemoAcoEngine(maze, opts);
  let last: DemoAcoSnapshot | null = engine.snapshots[engine.snapshots.length - 1] ?? null;

  while (!engine.done) {
    last = stepDemoAco(engine);
  }

  if (!last) {
    throw new Error('runDemoAco: el motor no produjo snapshots');
  }

  const convergence: DemoAcoConvergencePoint[] = engine.snapshots
    .filter((snapshot) => snapshot.iteration > 0)
    .map((snapshot) => ({
      iteration: snapshot.iteration,
      bestCost: snapshot.bestCost,
      iterationBestCost: snapshot.iterationBestCost,
    }));

  const iterationsRun = engine.snapshots.filter((s) => s.iteration > 0).length;

  return {
    snapshots: engine.snapshots,
    final: last,
    stoppedEarly: last.stoppedEarly,
    iterationsRun,
    convergence,
  };
}

/** Compara dos ejecuciones para tests de reproducibilidad. */
export function demoAcoSnapshotsMatch(a: DemoAcoSnapshot[], b: DemoAcoSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    const left = a[index]!;
    const right = b[index]!;
    if (
      left.iteration !== right.iteration ||
      left.bestCost !== right.bestCost ||
      left.iterationBestCost !== right.iterationBestCost ||
      left.improved !== right.improved ||
      left.stoppedEarly !== right.stoppedEarly ||
      left.done !== right.done ||
      left.ants.length !== right.ants.length
    ) {
      return false;
    }

    if (!pathsEqual(left.bestPath, right.bestPath)) return false;

    for (let antIndex = 0; antIndex < left.ants.length; antIndex++) {
      const leftAnt = left.ants[antIndex]!;
      const rightAnt = right.ants[antIndex]!;
      if (
        leftAnt.id !== rightAnt.id ||
        leftAnt.cost !== rightAnt.cost ||
        leftAnt.completed !== rightAnt.completed ||
        !pathsEqual(leftAnt.path, rightAnt.path)
      ) {
        return false;
      }
    }

    if (!pheromoneMatricesEqual(left.pheromone, right.pheromone)) return false;
  }
  return true;
}

function pathsEqual(a: MazePoint[], b: MazePoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (!pointsEqual(a[index]!, b[index]!)) return false;
  }
  return true;
}

function pheromoneMatricesEqual(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.length !== b[i]!.length) return false;
    for (let j = 0; j < a[i]!.length; j++) {
      if (a[i]![j] !== b[i]![j]) return false;
    }
  }
  return true;
}
