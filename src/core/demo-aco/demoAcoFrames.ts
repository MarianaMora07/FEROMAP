import type { MazeDefinition, MazePoint } from './mazeTypes';
import {
  buildMazeGraph,
  getMazeNeighbors,
  mazeNodeId,
  mazePointFromId,
} from './mazeGraph';
import type { DemoAcoAntSnapshot, DemoAcoSnapshot } from './demoAcoEngine';
import {
  clonePheromoneMatrix,
  createInitialSnapshotState,
  createSeededRng,
  depositPheromone,
  evaporatePheromone,
  initPheromoneMatrix,
  pickCandidate,
  resolveDemoAcoOptions,
  type DemoAcoOptions,
  type DemoAcoRunResult,
} from './demoAcoEngine';

const GRID_EDGE_COST = 1;

export type DemoAcoFramePhase = 'initial' | 'ant_move' | 'iteration_end';

export interface DemoAcoAntDecision {
  antId: number;
  stepIndex: number;
  from: MazePoint;
  candidates: MazePoint[];
  chosen: MazePoint;
  chosenProbability: number;
  candidateProbabilities: number[];
}

export interface DemoAcoFrame {
  frameIndex: number;
  iteration: number;
  phase: DemoAcoFramePhase;
  ants: DemoAcoAntSnapshot[];
  pheromone: number[][];
  bestPath: MazePoint[];
  bestCost: number;
  iterationBestPath: MazePoint[];
  iterationBestCost: number;
  decision?: DemoAcoAntDecision;
  improved: boolean;
  stoppedEarly: boolean;
  done: boolean;
}

export interface DemoAcoRunWithFrames extends DemoAcoRunResult {
  frames: DemoAcoFrame[];
}

function nodePathToPoints(width: number, nodePath: number[]): MazePoint[] {
  return nodePath.map((id) => mazePointFromId(width, id));
}

function candidateProbabilities(
  currentId: number,
  candidateIds: number[],
  pheromone: number[][],
  alpha: number,
  beta: number,
): number[] {
  const weights = candidateIds.map((candidateId) => {
    const tau = pheromone[currentId][candidateId]! ** alpha;
    const eta = (1 / GRID_EDGE_COST) ** beta;
    return tau * eta;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return candidateIds.map(() => 1 / candidateIds.length);
  }
  return weights.map((weight) => weight / total);
}

function buildAntsForFrame(
  maze: MazeDefinition,
  completed: DemoAcoAntSnapshot[],
  activeAnt: DemoAcoAntSnapshot | null,
  pendingAntIds: number[],
): DemoAcoAntSnapshot[] {
  const ants: DemoAcoAntSnapshot[] = [...completed];
  if (activeAnt) {
    ants.push(activeAnt);
  }
  for (const antId of pendingAntIds) {
    ants.push({
      id: antId,
      path: [maze.start],
      cost: Infinity,
      completed: false,
    });
  }
  return ants.sort((left, right) => left.id - right.id);
}

function snapshotFromFrame(frame: DemoAcoFrame): DemoAcoSnapshot {
  return {
    iteration: frame.iteration,
    ants: frame.ants,
    pheromone: frame.pheromone,
    bestPath: frame.bestPath,
    bestCost: frame.bestCost,
    iterationBestPath: frame.iterationBestPath,
    iterationBestCost: frame.iterationBestCost,
    improved: frame.improved,
    stoppedEarly: frame.stoppedEarly,
    done: frame.done,
  };
}

export function runDemoAcoWithFrames(maze: MazeDefinition, opts?: DemoAcoOptions): DemoAcoRunWithFrames {
  const options = resolveDemoAcoOptions(opts);
  const graph = buildMazeGraph(maze);
  const nodeCount = maze.cells.length;
  const pheromone = initPheromoneMatrix(nodeCount);
  const width = maze.width;

  let iteration = 0;
  let bestNodePath = [graph.startNodeId];
  let bestPath: MazePoint[] = [maze.start];
  let bestCost = Infinity;
  let stallCount = 0;
  let stoppedEarly = false;
  let done = false;

  const snapshots: DemoAcoSnapshot[] = [];
  const frames: DemoAcoFrame[] = [];

  const pushFrame = (partial: Omit<DemoAcoFrame, 'frameIndex'>) => {
    frames.push({ ...partial, frameIndex: frames.length });
  };

  if (options.includeInitialSnapshot) {
    const initial = createInitialSnapshotState(maze, pheromone);
    snapshots.push(initial);
    pushFrame({
      iteration: 0,
      phase: 'initial',
      ants: [],
      pheromone: clonePheromoneMatrix(pheromone),
      bestPath: initial.bestPath,
      bestCost: initial.bestCost,
      iterationBestPath: initial.iterationBestPath,
      iterationBestCost: initial.iterationBestCost,
      improved: false,
      stoppedEarly: false,
      done: false,
    });
  }

  while (!done) {
    iteration += 1;
    let iterationBestNodePath: number[] = [];
    let iterationBestCost = Infinity;
    const completedAnts: DemoAcoAntSnapshot[] = [];
    let improved = false;

    for (let antIndex = 0; antIndex < options.ants; antIndex++) {
      const antRng = createSeededRng(options.seed + iteration * options.ants + antIndex);
      const visited = new Set<number>([graph.startNodeId]);
      const nodePath: number[] = [graph.startNodeId];
      let stepIndex = 0;

      while (nodePath[nodePath.length - 1] !== graph.endNodeId) {
        if (nodePath.length > maze.cells.length) {
          break;
        }

        const currentId = nodePath[nodePath.length - 1]!;
        const currentPoint = mazePointFromId(width, currentId);
        const neighborPoints = getMazeNeighbors(maze, currentPoint);
        const candidatePoints = neighborPoints.filter((point) => {
          const id = mazeNodeId(width, point);
          return !visited.has(id);
        });

        if (candidatePoints.length === 0) {
          break;
        }

        const candidateIds = candidatePoints.map((point) => mazeNodeId(width, point));
        const probabilities = candidateProbabilities(
          currentId,
          candidateIds,
          pheromone,
          options.alpha,
          options.beta,
        );
        const nextId = pickCandidate(
          antRng,
          currentId,
          candidateIds,
          pheromone,
          options.alpha,
          options.beta,
        );
        const chosenPoint = mazePointFromId(width, nextId);
        const chosenIndex = candidateIds.indexOf(nextId);
        const chosenProbability = probabilities[chosenIndex] ?? 0;

        nodePath.push(nextId);
        visited.add(nextId);
        stepIndex += 1;

        const activeAnt: DemoAcoAntSnapshot = {
          id: antIndex,
          path: nodePathToPoints(width, nodePath),
          cost: Infinity,
          completed: false,
        };

        pushFrame({
          iteration,
          phase: 'ant_move',
          ants: buildAntsForFrame(
            maze,
            completedAnts,
            activeAnt,
            Array.from({ length: options.ants - antIndex - 1 }, (_, offset) => antIndex + 1 + offset),
          ),
          pheromone: clonePheromoneMatrix(pheromone),
          bestPath: [...bestPath],
          bestCost,
          iterationBestPath: [...bestPath],
          iterationBestCost: iterationBestCost,
          decision: {
            antId: antIndex,
            stepIndex,
            from: currentPoint,
            candidates: candidatePoints,
            chosen: chosenPoint,
            chosenProbability,
            candidateProbabilities: probabilities,
          },
          improved: false,
          stoppedEarly: false,
          done: false,
        });
      }

      const completed = nodePath[nodePath.length - 1] === graph.endNodeId;
      const cost = completed ? nodePath.length - 1 : Infinity;
      const antSnapshot: DemoAcoAntSnapshot = {
        id: antIndex,
        path: nodePathToPoints(width, nodePath),
        cost,
        completed,
      };
      completedAnts.push(antSnapshot);

      if (completed && cost < iterationBestCost) {
        iterationBestCost = cost;
        iterationBestNodePath = [...nodePath];
      }
    }

    if (
      iterationBestNodePath.length > 0 &&
      Number.isFinite(iterationBestCost) &&
      iterationBestCost < bestCost
    ) {
      bestCost = iterationBestCost;
      bestNodePath = [...iterationBestNodePath];
      bestPath = nodePathToPoints(width, bestNodePath);
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
        ? nodePathToPoints(width, iterationBestNodePath)
        : [...bestPath];

    const snapshot: DemoAcoSnapshot = {
      iteration,
      ants: completedAnts,
      pheromone: clonePheromoneMatrix(pheromone),
      bestPath: [...bestPath],
      bestCost,
      iterationBestPath,
      iterationBestCost,
      improved,
      stoppedEarly,
      done,
    };
    snapshots.push(snapshot);

    pushFrame({
      iteration,
      phase: 'iteration_end',
      ants: completedAnts,
      pheromone: clonePheromoneMatrix(pheromone),
      bestPath: [...bestPath],
      bestCost,
      iterationBestPath,
      iterationBestCost,
      improved,
      stoppedEarly,
      done,
    });
  }

  const final = snapshots[snapshots.length - 1]!;
  const convergence = snapshots
    .filter((snapshot) => snapshot.iteration > 0)
    .map((snapshot) => ({
      iteration: snapshot.iteration,
      bestCost: snapshot.bestCost,
      iterationBestCost: snapshot.iterationBestCost,
    }));

  return {
    snapshots,
    frames,
    final,
    stoppedEarly: final.stoppedEarly,
    iterationsRun: snapshots.filter((snapshot) => snapshot.iteration > 0).length,
    convergence,
  };
}

export function frameToSnapshot(frame: DemoAcoFrame): DemoAcoSnapshot {
  return snapshotFromFrame(frame);
}

export function decisionDirectionLabel(from: MazePoint, to: MazePoint): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1) return 'Este';
  if (dx === -1) return 'Oeste';
  if (dy === 1) return 'Sur';
  if (dy === -1) return 'Norte';
  return '—';
}

export function formatDecisionCandidates(
  decision: DemoAcoAntDecision,
): Array<{ label: string; probability: number; chosen: boolean }> {
  return decision.candidates.map((candidate, index) => ({
    label: decisionDirectionLabel(decision.from, candidate),
    probability: decision.candidateProbabilities[index] ?? 0,
    chosen: candidate.x === decision.chosen.x && candidate.y === decision.chosen.y,
  }));
}
