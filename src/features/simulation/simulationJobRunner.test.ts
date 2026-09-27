import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationOptimizationJob } from '../../core/api/simulationJobs';
import { runJobBasedExecution } from './simulationJobRunner';
import type { ExecutionUpdateHandlers } from './simulationExecutionRunner';

const mockStart = vi.fn();
const mockFetch = vi.fn();
const mockCancel = vi.fn();

vi.mock('../../core/api/simulationJobs', () => ({
  startSimulationOptimizeJob: (...args: unknown[]) => mockStart(...args),
  fetchSimulationOptimizeJob: (...args: unknown[]) => mockFetch(...args),
  cancelSimulationOptimizeJob: (...args: unknown[]) => mockCancel(...args),
}));

function completedJob(result: Record<string, unknown>): SimulationOptimizationJob {
  return {
    jobId: 'job-1',
    status: 'completed',
    phase: 'persistencia',
    progress: 95,
    logs: [],
    acoConvergence: [],
    result: result as SimulationOptimizationJob['result'],
    error: null,
  };
}

function runningJob(phase: string, progress: number): SimulationOptimizationJob {
  return {
    jobId: 'job-1',
    status: 'running',
    phase: phase as SimulationOptimizationJob['phase'],
    progress,
    logs: [],
    result: null,
    error: null,
  };
}

describe('runJobBasedExecution', () => {
  const handlers: ExecutionUpdateHandlers = {
    setPhase: vi.fn(),
    setProgress: vi.fn(),
    appendLog: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue({ jobId: 'job-1' });
    mockCancel.mockResolvedValue({ jobId: 'job-1', status: 'cancelled' });
  });

  it('termina cuando el job está completed con result', async () => {
    const result = {
      simulationId: 42,
      scenarioId: 'normal',
      kpis: { distanceKm: { current: 10, optimized: 7 } },
      routes: {
        current: { type: 'FeatureCollection', features: [] },
        optimized: { type: 'FeatureCollection', features: [] },
      },
      logs: [],
    };

    mockFetch.mockResolvedValueOnce(completedJob(result));

    const value = await runJobBasedExecution('normal', undefined, handlers);

    expect(value.simulationId).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reintenta cuando completed llega sin result y luego lo obtiene', async () => {
    const result = {
      simulationId: 7,
      scenarioId: 'normal',
      kpis: {},
      routes: {
        current: { type: 'FeatureCollection', features: [] },
        optimized: { type: 'FeatureCollection', features: [] },
      },
      logs: [],
    };

    mockFetch
      .mockResolvedValueOnce({ ...completedJob(result), result: null })
      .mockResolvedValueOnce(completedJob(result));

    const value = await runJobBasedExecution('normal', undefined, handlers);

    expect(value.simulationId).toBe(7);
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('no aplica fase listo del servidor mientras el job sigue running', async () => {
    const result = {
      simulationId: 1,
      scenarioId: 'normal',
      kpis: {},
      routes: {
        current: { type: 'FeatureCollection', features: [] },
        optimized: { type: 'FeatureCollection', features: [] },
      },
      logs: [],
    };

    mockFetch
      .mockResolvedValueOnce(runningJob('listo', 95))
      .mockResolvedValueOnce(completedJob(result));

    await runJobBasedExecution('normal', undefined, handlers);

    const phases = vi.mocked(handlers.setPhase).mock.calls.map(([phase]) => phase);
    expect(phases).not.toContain('listo');
    expect(phases).toContain('persistencia');
  });

  it('lanza error si completed nunca trae result', async () => {
    mockFetch.mockResolvedValue({ ...completedJob({}), result: null });

    await expect(runJobBasedExecution('normal', undefined, handlers)).rejects.toThrow(
      /no devolvió los resultados/,
    );
  });
});
