import type { SimulationLogEntry } from '../../data/types/simulation';
import {
  EXECUTION_PHASES,
  getPhaseProgressPercent,
  getPhaseStartProgressPercent,
  resolvePhaseFromLogMessage,
  type ExecutionPhaseId,
} from './executionPhases';

export interface ExecutionUpdateHandlers {
  setPhase: (phaseId: ExecutionPhaseId) => void;
  setProgress: (percent: number) => void;
  appendLog: (log: SimulationLogEntry) => void;
  isCancelled?: () => boolean;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enrichLog(log: SimulationLogEntry): SimulationLogEntry {
  const phaseId = resolvePhaseFromLogMessage(log.message) ?? undefined;
  return phaseId ? { ...log, phaseId } : log;
}

async function waitUnlessCancelled(ms: number, isCancelled?: () => boolean) {
  const stepMs = 50;
  let elapsed = 0;
  while (elapsed < ms) {
    if (isCancelled?.()) throw new ExecutionCancelledError();
    const chunk = Math.min(stepMs, ms - elapsed);
    await delay(chunk);
    elapsed += chunk;
  }
  if (isCancelled?.()) throw new ExecutionCancelledError();
}

/** Avanza por fases con temporizador hasta `aco` (inclusive) mientras espera el trabajo async. */
async function runPhaseTimerUntilAco(handlers: ExecutionUpdateHandlers): Promise<void> {
  const holdAtAco = EXECUTION_PHASES.findIndex((phase) => phase.id === 'aco');
  for (let index = 0; index <= holdAtAco; index++) {
    const phase = EXECUTION_PHASES[index]!;
    handlers.setPhase(phase.id);
    handlers.setProgress(getPhaseStartProgressPercent(phase.id));
    await waitUnlessCancelled(phase.simulatedDurationMs, handlers.isCancelled);
    handlers.setProgress(getPhaseProgressPercent(phase.id));
  }
}

async function replayLogs(
  logs: SimulationLogEntry[],
  handlers: ExecutionUpdateHandlers,
  pauseMs = 300,
): Promise<void> {
  for (const raw of logs) {
    const log = enrichLog(raw);
    if (log.phaseId) {
      handlers.setPhase(log.phaseId);
      handlers.setProgress(getPhaseProgressPercent(log.phaseId));
    }
    handlers.appendLog(log);
    await waitUnlessCancelled(pauseMs, handlers.isCancelled);
  }
}

async function finishPhases(handlers: ExecutionUpdateHandlers): Promise<void> {
  handlers.setPhase('listo');
  handlers.setProgress(100);
}

/**
 * Modo mock: animación por fases + reproducción de logs (ya disponibles).
 */
export async function runPhasedMockExecution(
  logs: SimulationLogEntry[],
  handlers: ExecutionUpdateHandlers,
): Promise<void> {
  handlers.setPhase('preparando');
  handlers.setProgress(0);
  await waitUnlessCancelled(500, handlers.isCancelled);

  await replayLogs(logs, handlers, 380 + Math.random() * 220);
  await finishPhases(handlers);
}

/**
 * Modo API: temporizador en paralelo al POST; luego logs ligados al stepper.
 */
export async function runPhasedApiExecution<T>(
  fetchWork: () => Promise<T & { logs: SimulationLogEntry[] }>,
  handlers: ExecutionUpdateHandlers,
): Promise<T> {
  handlers.setPhase('preparando');
  handlers.setProgress(0);

  const result = await Promise.all([fetchWork(), runPhaseTimerUntilAco(handlers)]).then(
    ([value]) => value,
  );

  const remainingPhases = EXECUTION_PHASES.filter(
    (phase) => phase.order > getExecutionPhaseOrder('aco') && phase.id !== 'listo',
  );
  for (const phase of remainingPhases) {
    handlers.setPhase(phase.id);
    handlers.setProgress(getPhaseStartProgressPercent(phase.id));
    await waitUnlessCancelled(Math.min(phase.simulatedDurationMs, 500), handlers.isCancelled);
  }

  await replayLogs(result.logs, handlers, 320);
  await finishPhases(handlers);
  return result;
}

function getExecutionPhaseOrder(phaseId: ExecutionPhaseId): number {
  return EXECUTION_PHASES.find((phase) => phase.id === phaseId)?.order ?? 0;
}

export class ExecutionCancelledError extends Error {
  constructor() {
    super('Ejecución cancelada');
    this.name = 'ExecutionCancelledError';
  }
}
