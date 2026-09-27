import { describe, expect, it } from 'vitest';
import {
  EXECUTION_PHASE_COUNT,
  getExecutionPhase,
  isExecutionPhaseId,
  tryGetExecutionPhase,
} from './executionPhases';

describe('executionPhases helpers', () => {
  it('valida ids de fase conocidos', () => {
    expect(isExecutionPhaseId('aco')).toBe(true);
    expect(isExecutionPhaseId('listo')).toBe(true);
    expect(isExecutionPhaseId('persistencia')).toBe(true);
    expect(isExecutionPhaseId('cancelado')).toBe(false);
    expect(isExecutionPhaseId(null)).toBe(false);
    expect(isExecutionPhaseId(undefined)).toBe(false);
  });

  it('resuelve fase o null de forma segura', () => {
    expect(tryGetExecutionPhase('grafo_vial')?.label).toBe('Red de calles');
    expect(tryGetExecutionPhase('desconocido')).toBeNull();
    expect(tryGetExecutionPhase(null)).toBeNull();
  });

  it('mantiene el conteo de fases del wizard', () => {
    expect(EXECUTION_PHASE_COUNT).toBe(9);
    expect(getExecutionPhase('listo').order).toBe(9);
  });
});
