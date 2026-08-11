import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXECUTION_PHASES,
  formatWizardExecutionSubstatus,
  getExecutionPhase,
} from '../../features/simulation/executionPhases';
import {
  ExecutionCancelledError,
  runPhasedMockExecution,
  type ExecutionUpdateHandlers,
} from '../../features/simulation/simulationExecutionRunner';

describe('simulationExecutionRunner', () => {
  it('avanza por fases y llega a listo con progreso creciente', async () => {
    const phases: string[] = [];
    let progress = 0;

    const handlers: ExecutionUpdateHandlers = {
      setPhase: (phaseId) => phases.push(phaseId),
      setProgress: (value) => {
        progress = value;
      },
      appendLog: () => undefined,
    };

    await runPhasedMockExecution(
      [{ id: '1', timestamp: '10:00', message: 'Iniciando optimización', type: 'info' }],
      handlers,
    );

    expect(phases.at(-1)).toBe('listo');
    expect(progress).toBe(100);
    expect(phases.length).toBeGreaterThan(2);
  });

  it('interrumpe con ExecutionCancelledError al cancelar', async () => {
    let cancelled = false;
    const handlers: ExecutionUpdateHandlers = {
      setPhase: () => undefined,
      setProgress: () => undefined,
      appendLog: () => undefined,
      isCancelled: () => cancelled,
    };

    const run = runPhasedMockExecution([], handlers);
    cancelled = true;

    await expect(run).rejects.toBeInstanceOf(ExecutionCancelledError);
  });
});

describe('executionPhases helpers', () => {
  it('formatea el sub-estado del wizard', () => {
    expect(formatWizardExecutionSubstatus(3, 8, 'Distancias y tiempos')).toBe(
      'Ejecutando — fase 3 de 8: Distancias y tiempos',
    );
  });

  it('mantiene el orden de las 8 fases', () => {
    expect(EXECUTION_PHASES.map((phase) => phase.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(getExecutionPhase('aco').label).toBe('Búsqueda inteligente');
  });
});
