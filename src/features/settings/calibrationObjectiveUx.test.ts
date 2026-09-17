import { describe, expect, it } from 'vitest';
import type { ObjectiveSweepPayload, ObjectiveSweepRun } from '../../core/api/benchmark';
import {
  acceptanceCards,
  bestObjectiveRun,
  frontierLabels,
  frontierRows,
  isInFrontier,
  isValidObjectiveRun,
  objectiveFindings,
  shiftLabel,
  tableRows,
  weightsLabel,
} from './calibrationObjectiveUx';

function run(label: string, patch: Partial<ObjectiveSweepRun> = {}): ObjectiveSweepRun {
  return {
    label,
    durationHours: 8,
    workloadBalanceWeight: 0,
    makespanWeight: 0,
    minActiveVehiclesRequested: null,
    distanceKmOptimized: 140.6,
    distanceKmBaseline: 265.7,
    activeVehicles: 6,
    maxRouteHours: 8.09,
    shiftSlackHours: 3.91,
    finishUnderTargetPct: 66.7,
    workloadStdHours: 1.2,
    fairnessIndex: 0.84,
    uncoveredPoints: 0,
    computationSeconds: 2.53,
    ...patch,
  };
}

/** Payload sintético con una frontera de 2 soluciones y criterios AC evaluados por el motor. */
function payload(): ObjectiveSweepPayload {
  const base8 = run('base 8 h (w=0)');
  const makespan5 = run('makespan 5', {
    makespanWeight: 5,
    distanceKmOptimized: 125.0,
    maxRouteHours: 7.47,
  });
  const dominated = run('equidad 5', {
    workloadBalanceWeight: 5,
    distanceKmOptimized: 162.4,
    maxRouteHours: 7.73,
  });
  const failed = run('12 h · equidad 2', {
    durationHours: null,
    workloadBalanceWeight: 2,
    uncoveredPoints: 3,
  });

  return {
    generatedAt: '2026-09-15T17:55:35+00:00',
    durationSeconds: 215.4,
    scenarioId: 'normal',
    seed: 42,
    maxRouteHoursTarget: 8,
    runs: [base8, makespan5, dominated, failed],
    // La frontera la calcula el backend: la UI la muestra tal cual.
    paretoFrontier: [makespan5, base8],
    acceptance: {
      ac1: {
        criterion: 'distanceKm.optimized ≤ 1.15 × distanceKm.optimized(w=0)',
        acceptedPoint: {
          label: 'makespan 5',
          distanceKmOptimized: 125,
          baselineKm: 140.6,
          limitKm: 161.69,
          ratio: 0.889,
          ok: true,
        },
        checks: [],
        exceptions: [],
        ok: true,
      },
      ac2: {
        criterion: 'activeVehicles ≥ 3 y maxRouteHours ≤ 8 h',
        candidates: ['makespan 5', 'base 8 h (w=0)'],
        ok: true,
      },
      ac3: {
        criterion: 'distinctVehiclesWeek ≥ 6 de 8',
        evidence: 'test_weekly_rotation_increases_distinct_vehicles (unitario)',
        ok: null,
      },
    },
  };
}

describe('barrido de pesos — frontera y criterios de aceptación (Fase 7)', () => {
  it('muestra la frontera del payload sin recalcular dominancia', () => {
    const data = payload();

    expect(frontierLabels(data)).toEqual(['makespan 5', 'base 8 h (w=0)']);
    expect(isInFrontier(data, data.runs[1]!)).toBe(true);
    // «equidad 5» está dominada por «base 8 h (w=0)»: el backend la dejó fuera.
    expect(isInFrontier(data, data.runs[2]!)).toBe(false);
    expect(frontierRows(data)).toHaveLength(2);
  });

  it('expone AC-1/AC-2/AC-3 con el estado reportado por el motor', () => {
    const cards = acceptanceCards(payload());

    expect(cards.map((card) => card.id)).toEqual(['ac1', 'ac2', 'ac3']);
    expect(cards[0]).toMatchObject({ ok: true, titleKey: 'calibration.ac1' });
    expect(cards[1]).toMatchObject({ ok: true, titleKey: 'calibration.ac2' });
    // AC-3 se evidencia con un test unitario: sin veredicto automático.
    expect(cards[2]?.ok).toBeNull();
    expect(cards[0]?.detail).toContain('makespan 5');
  });

  it('deja las corridas inválidas fuera del ranking pero visibles al final', () => {
    const rows = tableRows(payload());

    expect(rows.map((item) => item.label)).toEqual([
      'base 8 h (w=0)',
      'makespan 5',
      'equidad 5',
      '12 h · equidad 2',
    ]);
    expect(isValidObjectiveRun(payload().runs[3]!)).toBe(false);
    expect(bestObjectiveRun(payload())?.label).toBe('makespan 5');
  });

  it('etiqueta jornada y pesos de cada corrida', () => {
    const data = payload();

    expect(shiftLabel(data.runs[0]!)).toBe('8 h');
    expect(shiftLabel(data.runs[3]!)).toBe('12 h (defecto)');
    expect(weightsLabel(data.runs[1]!)).toBe('λb 0 · λt 5');
    expect(
      weightsLabel(run('mín. 6 vehículos', { minActiveVehiclesRequested: 6 })),
    ).toBe('λb 0 · λt 0 · mín. 6 veh.');
  });

  it('deriva la lectura automática del barrido', () => {
    const findings = objectiveFindings(payload());
    const keys = findings.map((finding) => finding.labelKey);

    expect(keys).toContain('calibration.reading.best');
    expect(keys).toContain('calibration.reading.pareto');
    expect(keys).toContain('calibration.reading.excluded');
    expect(
      findings.find((finding) => finding.labelKey === 'calibration.reading.pareto')?.detail,
    ).toBe('2 · makespan 5, base 8 h (w=0)');
  });

  it('el detalle de la frontera no lleva texto traducible', () => {
    for (const finding of objectiveFindings(payload())) {
      expect(finding.detail).not.toMatch(/calibration\./);
      expect(finding.detail).not.toMatch(/soluciones/);
    }
  });
});
