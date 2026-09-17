import { describe, expect, it } from 'vitest';
import type { AcoSensitivityPayload, AcoSensitivityRun } from '../../core/api/benchmark';
import {
  AXIS_ORDER,
  bestRun,
  bestRunWithoutEarlyStop,
  excludedRuns,
  isValidRun,
  levelLabel,
  mostSensitiveAxis,
  rankedRuns,
  readingFindings,
  stableAxes,
  summarizeAxes,
} from './calibrationSensitivityUx';

function run(
  axis: AcoSensitivityRun['axis'],
  label: string,
  distance: number | undefined,
  patch: Partial<AcoSensitivityRun> = {},
): AcoSensitivityRun {
  return {
    label,
    scenarioId: 'normal',
    acoAnts: 12,
    acoIterations: 20,
    axis,
    distanceKmOptimized: distance,
    distanceKmBaseline: 506.6,
    acoIterationsRun: 20,
    acoStoppedEarly: false,
    uncoveredPoints: 0,
    ...patch,
  };
}

/** Payload sintético: 6 ejes × 3 niveles, con un eje claramente sensible (β). */
function payload(): AcoSensitivityPayload {
  return {
    generatedAt: '2026-09-17T15:29:10+00:00',
    durationSeconds: 315.4,
    scenarioId: 'normal',
    seed: 42,
    standardProfile: { acoAnts: 12, acoIterations: 20 },
    runs: [
      run('ants', '8 hormigas', 190.8),
      run('ants', '12 hormigas (estándar)', 190.6),
      run('ants', '20 hormigas', 194.2),
      run('iterations', '10 iteraciones', 190.8, { acoIterations: 10 }),
      run('iterations', '20 iteraciones (estándar)', 190.7),
      run('iterations', '40 iteraciones', 190.9, { acoIterations: 40 }),
      run('alpha', 'α 0.5', 200.2, { acoAlpha: 0.5 }),
      run('alpha', 'α 1 (estándar)', 190.8, { acoAlpha: 1 }),
      run('alpha', 'α 2', 190.2, { acoAlpha: 2 }),
      run('beta', 'β 1', 237.6, { acoBeta: 1 }),
      run('beta', 'β 3 (estándar)', 190.8, { acoBeta: 3 }),
      run('beta', 'β 5', 184.7, { acoBeta: 5 }),
      run('rho', 'ρ 0.05', 190.8, { acoRho: 0.05 }),
      run('rho', 'ρ 0.12 (estándar)', 190.8, { acoRho: 0.12 }),
      run('rho', 'ρ 0.30', undefined, { acoRho: 0.3, error: 'ACO agotó el tiempo' }),
      run('q', 'Q 0.5', 190.8, { pheromoneQ: 0.5 }),
      run('q', 'Q 1 (estándar)', 190.8, { pheromoneQ: 1 }),
      run('q', 'Q 2', 191.0, { pheromoneQ: 2, uncoveredPoints: 2 }),
    ],
  };
}

describe('sensibilidad ACO — derivaciones por eje (Fase 6)', () => {
  it('ordena las corridas del eje por distancia optimizada', () => {
    const ranked = rankedRuns(payload().runs, 'beta');
    expect(ranked.map((item) => item.label)).toEqual(['β 5', 'β 3 (estándar)', 'β 1']);
  });

  it('excluye del ranking las corridas con error o puntos no cubiertos', () => {
    const runs = payload().runs;
    const rho = rankedRuns(runs, 'rho');
    const q = rankedRuns(runs, 'q');

    expect(rho.map((item) => item.label)).not.toContain('ρ 0.30');
    expect(q.map((item) => item.label)).not.toContain('Q 2');
    expect(excludedRuns(runs).map((item) => item.label)).toEqual(['ρ 0.30', 'Q 2']);
    expect(isValidRun(run('q', 'Q 2', 191, { uncoveredPoints: 1 }))).toBe(false);
    expect(isValidRun(run('q', 'Q 2', undefined))).toBe(false);
    expect(isValidRun(run('q', 'Q 2', 191))).toBe(true);
  });

  it('identifica el mejor nivel de cada eje y el mejor global', () => {
    const summaries = summarizeAxes(payload().runs);
    const beta = summaries.find((item) => item.axis === 'beta');

    expect(beta?.best?.label).toBe('β 5');
    expect(beta?.bestKm).toBe(184.7);
    expect(bestRun(payload().runs)?.label).toBe('β 5');
    expect(summaries).toHaveLength(AXIS_ORDER.length);
  });

  it('calcula la amplitud y marca el eje más sensible', () => {
    const summaries = summarizeAxes(payload().runs);
    const beta = summaries.find((item) => item.axis === 'beta');
    const sensitive = mostSensitiveAxis(summaries);

    expect(beta?.amplitudeKm).toBeCloseTo(52.9, 1);
    expect(beta?.amplitudePct).toBeCloseTo(28.6, 1);
    expect(sensitive?.axis).toBe('beta');
  });

  it('declara insensibles los ejes con amplitud ≤ 0,5 % del mejor', () => {
    const summaries = summarizeAxes(payload().runs);
    const stable = stableAxes(summaries).map((item) => item.axis);

    expect(stable).toEqual(['iterations', 'rho', 'q']);
    expect(summaries.find((item) => item.axis === 'beta')?.stable).toBe(false);
  });

  it('avisa cuando la mejor corrida usó early-stop', () => {
    const withEarlyStop = [
      run('ants', '8 hormigas', 190.8, { acoStoppedEarly: true, acoIterationsRun: 10 }),
    ];

    expect(bestRunWithoutEarlyStop(withEarlyStop)).toBeNull();
    expect(bestRunWithoutEarlyStop(payload().runs)?.label).toBe('β 5');
  });

  it('etiqueta el nivel de cada eje', () => {
    expect(levelLabel(run('ants', '8 hormigas', 190, { acoAnts: 8 }))).toBe('8');
    expect(levelLabel(run('alpha', 'α 0.5', 200, { acoAlpha: 0.5 }))).toBe('α 0.5');
    expect(levelLabel(run('q', 'Q 2', 191, { pheromoneQ: 2 }))).toBe('Q 2');
  });

  it('deriva la lectura automática con la mejor corrida y las excluidas', () => {
    const findings = readingFindings(payload());
    const keys = findings.map((finding) => finding.labelKey);

    expect(keys).toContain('calibration.reading.best');
    expect(keys).toContain('calibration.reading.sensitive');
    expect(keys).toContain('calibration.reading.stable');
    expect(keys).toContain('calibration.reading.excluded');
    expect(findings[0]?.detail).toContain('184.7 km');

    const sensitive = findings.find(
      (finding) => finding.labelKey === 'calibration.reading.sensitive',
    );
    expect(sensitive?.axisKeys).toEqual(['calibration.axis.beta']);
    expect(sensitive?.detail).toBe('28.6 % (52.9 km)');

    const stable = findings.find((finding) => finding.labelKey === 'calibration.reading.stable');
    expect(stable?.axisKeys).toEqual([
      'calibration.axis.iterations',
      'calibration.axis.rho',
      'calibration.axis.q',
    ]);
    expect(stable?.detail).toBe('3/6');
  });

  it('el detalle nunca filtra claves i18n ni texto traducible', () => {
    for (const finding of readingFindings(payload())) {
      // Las claves i18n viajan en labelKey/axisKeys, no en el detalle.
      expect(finding.detail).not.toMatch(/calibration\./);
      expect(finding.labelKey).toMatch(/^calibration\.reading\./);
    }
  });

  it('avisa cuando la mejor corrida se detuvo antes de agotar iteraciones', () => {
    const withEarlyStop: AcoSensitivityPayload = {
      ...payload(),
      runs: [run('ants', '8 hormigas', 190.8, { acoStoppedEarly: true, acoIterationsRun: 10 })],
    };

    const findings = readingFindings(withEarlyStop);
    const quality = findings.find(
      (finding) =>
        finding.labelKey === 'calibration.reading.quality' ||
        finding.labelKey === 'calibration.reading.qualityEarlyStop',
    );

    expect(quality?.labelKey).toBe('calibration.reading.qualityEarlyStop');
    expect(quality?.detail).toBe('8 hormigas · 10');
  });
});
