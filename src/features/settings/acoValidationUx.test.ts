import { describe, expect, it } from 'vitest';
import type {
  AcoValidationParams,
  AcoValidationPayload,
  AcoValidationRun,
} from '../../core/api/benchmark';
import {
  deltaLabel,
  outcomeLabelKey,
  outcomeVariant,
  profileLabel,
  runLabelKey,
  validationCaveatKeys,
  validationRows,
} from './acoValidationUx';

const STANDARD: AcoValidationParams = {
  acoAnts: 12,
  acoIterations: 20,
  acoAlpha: 1,
  acoBeta: 3,
  acoRho: 0.12,
  pheromoneQ: 1,
};

function run(
  role: AcoValidationRun['role'],
  km: number,
  patch: Partial<AcoValidationRun> = {},
): AcoValidationRun {
  return {
    label: role === 'standard' ? 'Perfil estándar 12×20' : 'Combinación recomendada',
    role,
    params: role === 'standard' ? STANDARD : { ...STANDARD, acoBeta: 5 },
    distanceKmOptimized: km,
    computationSeconds: 12.5,
    acoIterationsRun: 20,
    acoStoppedEarly: false,
    uncoveredPoints: 0,
    ...patch,
  };
}

function payload(patch: Partial<AcoValidationPayload> = {}): AcoValidationPayload {
  return {
    generatedAt: '2026-09-17T15:29:10+00:00',
    durationSeconds: 25.1,
    scenarioId: 'normal',
    seed: 42,
    standardParams: STANDARD,
    profile: { ...STANDARD, acoBeta: 5 },
    sameParams: false,
    verdict: {
      outcome: 'better',
      reason: null,
      standardKm: 190.8,
      recommendedKm: 184.7,
      deltaKm: -6.1,
      deltaPct: -3.2,
    },
    runs: [run('standard', 190.8), run('recommended', 184.7)],
    instanceFingerprint: 'abc123',
    cacheState: 'fresh',
    stale: false,
    ...patch,
  };
}

describe('validación de la combinación — presentación (Fase 13)', () => {
  it('etiqueta el perfil con los seis parámetros', () => {
    expect(profileLabel(STANDARD)).toBe('12×20 · α1 β3 ρ0.12 Q1');
    expect(profileLabel({ ...STANDARD, acoBeta: 5 })).toBe('12×20 · α1 β5 ρ0.12 Q1');
  });

  it('rotula cada corrida y cada veredicto con claves i18n', () => {
    expect(runLabelKey('standard')).toBe('calibration.validation.run.standard');
    expect(runLabelKey('recommended')).toBe('calibration.validation.run.recommended');
    expect(outcomeLabelKey('better')).toBe('calibration.validation.outcome.better');
    expect(outcomeLabelKey('not-comparable')).toBe('calibration.validation.outcome.not-comparable');
  });

  it('asigna variante visual al veredicto', () => {
    expect(outcomeVariant('better')).toBe('success');
    expect(outcomeVariant('equal')).toBe('info');
    expect(outcomeVariant('worse')).toBe('warning');
    expect(outcomeVariant('not-comparable')).toBe('default');
  });

  it('firma la diferencia con signo explícito (negativo = mejora)', () => {
    expect(deltaLabel(payload())).toBe('-6.1 km (-3.20 %)');
    expect(
      deltaLabel(
        payload({
          verdict: {
            outcome: 'worse',
            reason: null,
            standardKm: 184.7,
            recommendedKm: 190.8,
            deltaKm: 6.1,
            deltaPct: 3.3,
          },
        }),
      ),
    ).toBe('+6.1 km (+3.30 %)');
    expect(
      deltaLabel(payload({ verdict: { ...payload().verdict, deltaKm: null, deltaPct: null } })),
    ).toBeNull();
  });

  it('no añade avisos cuando la comparación es limpia', () => {
    expect(validationCaveatKeys(payload())).toEqual([]);
  });

  it('avisa del mismo perfil, de la instancia vieja y del early-stop', () => {
    expect(validationCaveatKeys(payload({ sameParams: true }))).toEqual([
      'calibration.validation.caveat.same',
    ]);
    expect(validationCaveatKeys(payload({ stale: true }))).toEqual([
      'calibration.validation.caveat.stale',
    ]);

    const earlyStop = payload({
      runs: [run('standard', 190.8), run('recommended', 184.7, { acoStoppedEarly: true })],
    });
    expect(validationCaveatKeys(earlyStop)).toEqual(['calibration.validation.caveat.earlyStop']);
  });

  it('declara el motivo cuando el veredicto no es comparable', () => {
    const uncovered = payload({
      verdict: {
        outcome: 'not-comparable',
        reason: 'uncovered',
        standardKm: null,
        recommendedKm: null,
        deltaKm: null,
        deltaPct: null,
      },
    });

    expect(validationCaveatKeys(uncovered)).toEqual([
      'calibration.validation.reason.uncovered',
    ]);
    // Un motivo ausente cae a `missing` en vez de dejar la clave a medias.
    expect(
      validationCaveatKeys(
        payload({ verdict: { ...payload().verdict, outcome: 'not-comparable', reason: null } }),
      ),
    ).toEqual(['calibration.validation.reason.missing']);
  });

  it('lista las dos corridas con su perfil y sus guardarraíles', () => {
    const rows = validationRows(payload());

    expect(rows.map((row) => row.role)).toEqual(['standard', 'recommended']);
    expect(rows[0]?.profile).toBe('12×20 · α1 β3 ρ0.12 Q1');
    expect(rows[1]?.profile).toBe('12×20 · α1 β5 ρ0.12 Q1');
    expect(rows[1]?.km).toBe(184.7);
    expect(rows[0]?.seconds).toBe(12.5);
    expect(rows.every((row) => row.error === null)).toBe(true);
  });

  it('no inventa distancia si una corrida falló', () => {
    const failed = payload({
      runs: [run('standard', 190.8), run('recommended', 0, { error: 'ACO agotó el tiempo', distanceKmOptimized: undefined })],
    });

    const rows = validationRows(failed);

    expect(rows[1]?.km).toBeNull();
    expect(rows[1]?.error).toBe('ACO agotó el tiempo');
  });
});
