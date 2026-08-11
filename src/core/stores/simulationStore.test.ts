import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => ({
  useMocks: true,
}));

vi.mock('./appStore', () => ({
  loadRoutesWithRoadSnapping: vi.fn().mockResolvedValue(undefined),
  refreshAppRoutes: vi.fn().mockResolvedValue(undefined),
  showOptimizedRoute: vi.fn(),
}));

vi.mock('./dashboardStore', () => ({
  loadDashboardData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/simulationOperations', () => ({
  fetchSimulationHistory: vi.fn().mockResolvedValue([]),
  fetchSimulationDetail: vi.fn(),
  dispatchOptimizedRoutes: vi.fn(),
}));

const mockRunPhased = vi.fn();

vi.mock('../../features/simulation/simulationExecutionRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/simulation/simulationExecutionRunner')>();
  return {
    ...actual,
    runPhasedMockExecution: (...args: Parameters<typeof actual.runPhasedMockExecution>) =>
      mockRunPhased(...args),
  };
});

import {
  cancelOptimization,
  executionPhaseIndex,
  resetSimulationStoreForTests,
  runOptimization,
  simulationState,
  wasExecutionCancelled,
} from './simulationStore';
import { ExecutionCancelledError } from '../../features/simulation/simulationExecutionRunner';

describe('simulationStore execution', () => {
  beforeEach(() => {
    resetSimulationStoreForTests();
    mockRunPhased.mockReset();
  });

  it('actualiza fase y progreso durante la ejecución mock', async () => {
    mockRunPhased.mockImplementation(async (_logs, handlers) => {
      handlers.setPhase('preparando');
      handlers.setProgress(5);
      handlers.setPhase('grafo_vial');
      handlers.setProgress(15);
      handlers.setPhase('listo');
      handlers.setProgress(100);
    });

    await runOptimization();

    expect(simulationState.executionPhase).toBe('listo');
    expect(simulationState.optimizationProgress).toBe(100);
    expect(simulationState.executionStatus).toBe('listo');
    expect(simulationState.isOptimizing).toBe(false);
  });

  it('cancela y deja el estado limpio', async () => {
    mockRunPhased.mockImplementation(async (_logs, handlers) => {
      handlers.setPhase('aco');
      handlers.setProgress(40);
      while (!handlers.isCancelled?.()) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new ExecutionCancelledError();
    });

    const runPromise = runOptimization();
    await new Promise((resolve) => setTimeout(resolve, 30));
    cancelOptimization();
    await runPromise;

    expect(wasExecutionCancelled()).toBe(true);
    expect(simulationState.isOptimizing).toBe(false);
    expect(simulationState.executionStatus).toBe('cancelado');
    expect(simulationState.executionPhase).toBeNull();
    expect(simulationState.logs).toEqual([]);
    expect(simulationState.optimizationProgress).toBe(0);
  });

  it('expone el índice de fase actual', async () => {
    mockRunPhased.mockImplementation(async (_logs, handlers) => {
      handlers.setPhase('matriz_costos');
      handlers.setProgress(30);
      handlers.setPhase('listo');
      handlers.setProgress(100);
    });

    await runOptimization();
    expect(executionPhaseIndex()).toBe(8);
  });
});
