import { describe, expect, it } from 'vitest';
import type {
  AcoSensitivityPayload,
  AcoSensitivityRun,
  ObjectiveSweepPayload,
  ObjectiveSweepRun,
} from '../../core/api/benchmark';
import { advisorAlternatives, advisorOperatingPoint, advisorProfile, advisorProfileParams, calibrationAdvice, isStandardProfile, STANDARD_ACO_PARAMS } from './calibrationAdvisorUx';

function sensRun(
  axis: AcoSensitivityRun['axis'],
  label: string,
  km: number,
  patch: Partial<AcoSensitivityRun> = {},
): AcoSensitivityRun {
  return {
    label,
    scenarioId: 'normal',
    acoAnts: 12,
    acoIterations: 20,
    axis,
    distanceKmOptimized: km,
    distanceKmBaseline: 506.6,
    acoIterationsRun: 20,
    acoStoppedEarly: false,
    uncoveredPoints: 0,
    ...patch,
  };
}

/** 6 ejes × 3 niveles: β es la única perilla que mueve la distancia. */
const sensitivity: AcoSensitivityPayload = {
  generatedAt: '2026-09-17T15:29:10+00:00',
  durationSeconds: 315.4,
  scenarioId: 'normal',
  seed: 42,
  standardProfile: { acoAnts: 12, acoIterations: 20 },
  runs: [
    sensRun('ants', '8 hormigas', 190.8, { acoAnts: 8, computationSeconds: 2.9 }),
    sensRun('ants', '12 hormigas (estándar)', 190.8, { computationSeconds: 3.3 }),
    sensRun('ants', '20 hormigas', 194.2, { acoAnts: 20, computationSeconds: 3.2 }),
    sensRun('iterations', '10 iteraciones', 190.8, { acoIterations: 10 }),
    sensRun('iterations', '20 iteraciones (estándar)', 190.8),
    sensRun('iterations', '40 iteraciones', 190.8, { acoIterations: 40 }),
    sensRun('alpha', 'α 0.5', 200.2, { acoAlpha: 0.5 }),
    sensRun('alpha', 'α 1 (estándar)', 190.8, { acoAlpha: 1 }),
    sensRun('alpha', 'α 2', 190.2, { acoAlpha: 2 }),
    sensRun('beta', 'β 1', 237.6, { acoBeta: 1 }),
    sensRun('beta', 'β 3 (estándar)', 190.8, { acoBeta: 3 }),
    sensRun('beta', 'β 5', 184.7, { acoBeta: 5, acoIterationsRun: 19, acoStoppedEarly: true }),
    sensRun('rho', 'ρ 0.05', 190.8, { acoRho: 0.05 }),
    sensRun('rho', 'ρ 0.12 (estándar)', 190.8, { acoRho: 0.12 }),
    sensRun('rho', 'ρ 0.30', 187.9, { acoRho: 0.3 }),
    sensRun('q', 'Q 0.5', 190.8, { pheromoneQ: 0.5 }),
    sensRun('q', 'Q 1 (estándar)', 190.8, { pheromoneQ: 1 }),
    sensRun('q', 'Q 2', 190.8, { pheromoneQ: 2 }),
  ],
};

function objRun(
  label: string,
  km: number,
  patch: Partial<ObjectiveSweepRun> = {},
): ObjectiveSweepRun {
  return {
    label,
    durationHours: 8,
    workloadBalanceWeight: 0,
    makespanWeight: 0,
    minActiveVehiclesRequested: null,
    distanceKmOptimized: km,
    distanceKmBaseline: 265.7,
    activeVehicles: 6,
    maxRouteHours: 7.5,
    shiftSlackHours: 4.5,
    finishUnderTargetPct: 100,
    workloadStdHours: 0.12,
    fairnessIndex: 0.98,
    uncoveredPoints: 0,
    computationSeconds: 3,
    ...patch,
  };
}

const objective: ObjectiveSweepPayload = {
  generatedAt: '2026-09-15T17:55:35+00:00',
  durationSeconds: 189.9,
  scenarioId: 'normal',
  seed: 42,
  maxRouteHoursTarget: 8,
  runs: [
    objRun('base 8 h (w=0)', 140.6, { maxRouteHours: 8.09, finishUnderTargetPct: 66.7, workloadStdHours: 1.2, fairnessIndex: 0.84 }),
    objRun('equidad 1', 133.9, { workloadBalanceWeight: 1 }),
    objRun('equidad 2', 149.6, { workloadBalanceWeight: 2, fairnessIndex: 0.99 }),
    objRun('equidad 5', 162.4, { workloadBalanceWeight: 5, fairnessIndex: 0.99 }),
    objRun('makespan 1', 133.5, { makespanWeight: 1, maxRouteHours: 7.44, fairnessIndex: 0.95 }),
    objRun('makespan 5', 125.0, { makespanWeight: 5, maxRouteHours: 7.47, fairnessIndex: 0.98 }),
    objRun('12 h · equidad 2', 157.2, { durationHours: null, activeVehicles: 4, maxRouteHours: 11.41, finishUnderTargetPct: 0, workloadBalanceWeight: 2 }),
  ],
  paretoFrontier: [objRun('makespan 5', 125.0, { makespanWeight: 5, maxRouteHours: 7.47 }), objRun('makespan 1', 133.5, { makespanWeight: 1, maxRouteHours: 7.44 })],
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
      candidates: ['equidad 1', 'makespan 1', 'makespan 5'],
      ok: true,
    },
    ac3: { criterion: 'distinctVehiclesWeek ≥ 6 de 8', evidence: 'test unitario', ok: null },
  },
};

describe('recomendación de calibración (derivada de la evidencia)', () => {
  it('sugiere el mejor nivel medido de cada eje', () => {
    const profile = advisorProfile(sensitivity);

    expect(profile).not.toBeNull();
    const byAxis = Object.fromEntries(
      profile!.picks.map((pick) => [pick.axis, pick]),
    );
    expect(byAxis['beta']?.level).toBe('β 5');
    expect(byAxis['beta']?.km).toBe(184.7);
    expect(byAxis['alpha']?.level).toBe('α 2');
    expect(byAxis['rho']?.level).toBe('ρ 0.3');
    expect(profile!.bestKm).toBe(184.7);
    expect(profile!.referenceKm).toBe(506.6);
  });

  it('no propone nivel en los ejes que no mueven la distancia', () => {
    const profile = advisorProfile(sensitivity);
    const byAxis = Object.fromEntries(profile!.picks.map((pick) => [pick.axis, pick]));

    // iteraciones y Q son insensibles: se dejan como están.
    expect(byAxis['iterations']?.keep).toBe(true);
    expect(byAxis['iterations']?.level).toBeNull();
    expect(byAxis['q']?.keep).toBe(true);
    expect(byAxis['q']?.level).toBeNull();
    // Los ejes que sí mueven la distancia proponen nivel.
    expect(byAxis['beta']?.keep).toBe(false);
    expect(byAxis['alpha']?.keep).toBe(false);
    expect(profile!.picks.filter((pick) => pick.keep).map((pick) => pick.axis)).toEqual([
      'iterations',
      'q',
    ]);
  });

  it('marca el eje más sensible y el nivel que logró la mejor distancia', () => {
    const profile = advisorProfile(sensitivity)!;
    const byAxis = Object.fromEntries(profile.picks.map((pick) => [pick.axis, pick]));

    // β mueve la distancia (±52,9 km) y su nivel β 5 es el mejor medido (184,7 km).
    expect(profile.picks.filter((pick) => pick.sensitive).map((pick) => pick.axis)).toEqual(['beta']);
    expect(byAxis['beta']?.bestMeasured).toBe(true);
    // Los demás ejes que sí se mueven no son ni lo uno ni lo otro.
    expect(byAxis['alpha']?.sensitive).toBe(false);
    expect(byAxis['alpha']?.bestMeasured).toBe(false);
    expect(byAxis['rho']?.bestMeasured).toBe(false);
    // Un eje insensible no propone nivel, así que nunca queda como «mejor medido».
    expect(byAxis['iterations']?.bestMeasured).toBe(false);
    expect(byAxis['q']?.bestMeasured).toBe(false);
  });

  it('avisa del early-stop de la mejor corrida', () => {
    expect(advisorProfile(sensitivity)?.earlyStop).toBe(true);
    const withoutEarlyStop = { ...sensitivity, runs: sensitivity.runs.map((run) => ({ ...run, acoStoppedEarly: false })) };
    expect(advisorProfile(withoutEarlyStop)?.earlyStop).toBe(false);
  });

  it('sin corridas no propone perfil', () => {
    expect(advisorProfile({ ...sensitivity, runs: [] })).toBeNull();
  });

  it('elige el punto aceptado por AC-1/AC-2 como punto de operación', () => {
    const operating = advisorOperatingPoint(objective);

    expect(operating?.label).toBe('makespan 5');
    expect(operating?.km).toBe(125.0);
    expect(operating?.weights).toBe('λb 0 · λt 5');
    expect(operating?.acceptedBy).toEqual(['AC-1', 'AC-2']);
    expect(operating?.activeVehicles).toBe(6);
  });

  it('sin veredicto cae a la mejor corrida de 8 h (no a una de 12 h)', () => {
    const noVerdict: ObjectiveSweepPayload = {
      ...objective,
      acceptance: {
        ...objective.acceptance,
        ac1: { ...objective.acceptance.ac1, acceptedPoint: null },
      },
    };

    const operating = advisorOperatingPoint(noVerdict);

    expect(operating?.label).toBe('makespan 5');
    expect(operating?.acceptedBy).toEqual([]);
  });

  it('propone alternativas cercanas y marca las configuraciones que empeoran', () => {
    const { alternatives, avoid } = advisorAlternatives(objective);

    expect(alternatives.map((item) => item.label)).toEqual(['makespan 1', 'equidad 1']);
    expect(alternatives[0]?.noteKey).toBe('calibration.advice.noteHours');
    expect(alternatives[1]?.noteKey).toBe('calibration.advice.noteValid');
    expect(avoid.map((item) => item.label)).toEqual(['equidad 2', 'equidad 5']);
    expect(avoid.every((item) => item.km > 140.6)).toBe(true);
  });

  it('ignora las corridas de 12 h al recomendar el punto de operación', () => {
    const { alternatives } = advisorAlternatives(objective);

    expect(alternatives.map((item) => item.label)).not.toContain('12 h · equidad 2');
  });

  it('compone el consejo completo con lo que haya en caché', () => {
    const both = calibrationAdvice({ sensitivity, objective });

    expect(both.profile?.bestKm).toBe(184.7);
    expect(both.operating?.label).toBe('makespan 5');
    expect(both.acceptanceOk).toBe('2/3');

    const onlyObjective = calibrationAdvice({ objective });
    expect(onlyObjective.profile).toBeNull();
    expect(onlyObjective.operating?.label).toBe('makespan 5');

    const empty = calibrationAdvice({});
    expect(empty.profile).toBeNull();
    expect(empty.operating).toBeNull();
    expect(empty.acceptanceOk).toBe('—');
  });

  it('deriva la combinación a validar: mejor nivel de cada eje no estable', () => {
    const params = advisorProfileParams(sensitivity);

    // α, β, ρ, hormigas mueven la distancia → se propone su mejor nivel medido.
    expect(params).toEqual({
      acoAnts: 8,
      acoIterations: 20,
      acoAlpha: 2,
      acoBeta: 5,
      acoRho: 0.3,
      pheromoneQ: 1,
    });
    // Los ejes planos (iteraciones, Q) se quedan en el valor estándar.
    expect(params.acoIterations).toBe(STANDARD_ACO_PARAMS.acoIterations);
    expect(params.pheromoneQ).toBe(STANDARD_ACO_PARAMS.pheromoneQ);
    expect(isStandardProfile(params)).toBe(false);
  });

  it('reconoce cuando la combinación recomendada ya es el perfil estándar', () => {
    // Todos los ejes planos: no hay nada que desviar ni que validar.
    const flat: AcoSensitivityPayload = {
      ...sensitivity,
      runs: sensitivity.runs.map((run) => ({ ...run, distanceKmOptimized: 190.8 })),
    };

    const params = advisorProfileParams(flat);

    expect(params).toEqual(STANDARD_ACO_PARAMS);
    expect(isStandardProfile(params)).toBe(true);
  });
});
