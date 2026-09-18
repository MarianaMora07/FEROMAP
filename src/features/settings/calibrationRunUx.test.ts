import { describe, expect, it } from 'vitest';
import type { CalibrationJobSnapshot } from '../../core/api/benchmark';
import {
  CALIBRATION_METHOD_PHASE_OPTIONS,
  CALIBRATION_POLL_MS,
  controlsDisabled,
  defaultRunConfig,
  etaSeconds,
  formatEta,
  jobRequestFor,
  methodJobRequestFor,
  pendingSnapshot,
  progressPercent,
  runCounterLabel,
  runPhaseLabel,
  statusLabelKey,
  statusVariant,
  viewStateFor,
  wasServedFromCache,
} from './calibrationRunUx';

function snapshot(patch: Partial<CalibrationJobSnapshot> = {}): CalibrationJobSnapshot {
  return { ...pendingSnapshot('job-1', 'sensitivity'), ...patch };
}

describe('calibración — estado de la vista desde el poll (Fase 5)', () => {
  it('sin job y sin caché muestra el estado vacío', () => {
    expect(viewStateFor({ hasResults: false, job: null, error: null })).toBe('sin-datos');
  });

  it('con caché y sin ejecución muestra resultados sin recalcular nada', () => {
    expect(viewStateFor({ hasResults: true, job: null, error: null })).toBe('listo');
  });

  it('con job pendiente o en ejecución muestra progreso', () => {
    for (const status of ['pending', 'running'] as const) {
      expect(viewStateFor({ hasResults: true, job: snapshot({ status }), error: null })).toBe(
        'ejecutando',
      );
    }
  });

  it('cancelado conserva los resultados previos y fallido pasa a error', () => {
    expect(viewStateFor({ hasResults: true, job: snapshot({ status: 'cancelled' }), error: null })).toBe(
      'cancelado',
    );
    expect(viewStateFor({ hasResults: true, job: snapshot({ status: 'failed' }), error: null })).toBe(
      'error',
    );
  });

  it('un error de red manda sobre cualquier otro estado', () => {
    expect(
      viewStateFor({ hasResults: true, job: snapshot({ status: 'running' }), error: 'sin conexión' }),
    ).toBe('error');
  });

  it('deshabilita los controles solo mientras el job corre', () => {
    expect(controlsDisabled('pending')).toBe(true);
    expect(controlsDisabled('running')).toBe(true);
    expect(controlsDisabled('completed')).toBe(false);
    expect(controlsDisabled('cancelled')).toBe(false);
    expect(controlsDisabled('failed')).toBe(false);
    expect(controlsDisabled(null)).toBe(false);
  });
});

describe('calibración — petición del job y reutilización de caché (Fase 5)', () => {
  it('usa los defaults reproducibles (normal · seed 42)', () => {
    const config = defaultRunConfig();
    expect(config).toEqual({
      mode: 'sensitivity',
      scenarioId: 'normal',
      seed: 42,
      reuseCache: false,
      methodPhase: 'factorial',
      methodShort: false,
    });
    expect(jobRequestFor(config)).toEqual({ scenarioId: 'normal', seed: 42, refresh: true });
  });

  it('la fase del protocolo viaja en su propia petición, no en la de los barridos', () => {
    const config = {
      ...defaultRunConfig(),
      mode: 'method' as const,
      methodPhase: 'rsm' as const,
    };

    // ``jobRequestFor`` es la petición de los barridos clásicos: no debe llevar la fase.
    expect(jobRequestFor(config)).toEqual({ scenarioId: 'normal', seed: 42, refresh: true });

    const full = methodJobRequestFor(config);
    expect(full).toEqual({
      phase: 'rsm',
      seeds: null,
      resume: true,
      scenarioId: 'normal',
      seed: 42,
      refresh: true,
    });

    // La verificación corta usa las dos semillas de fontanería del protocolo.
    const short = methodJobRequestFor({ ...config, methodShort: true });
    expect(short.seeds).toEqual([42, 101]);
  });

  it('las opciones de objetivo incluyen el protocolo completo y las ocho fases', () => {
    expect(CALIBRATION_METHOD_PHASE_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'noise',
      'factorial',
      'budget',
      'nocut',
      'identify',
      'validate',
      'objective',
      'rsm',
    ]);
    expect(CALIBRATION_METHOD_PHASE_OPTIONS[0].labelKey).toBe('calibration.method.target.all');
    expect(CALIBRATION_METHOD_PHASE_OPTIONS[1].labelKey).toBe('calibration.method.phase.noise');
  });

  it('el protocolo completo viaja como objetivo `all` en su propia petición', () => {
    const config = {
      ...defaultRunConfig(),
      mode: 'method' as const,
      methodPhase: 'all' as const,
    };

    expect(methodJobRequestFor(config).phase).toBe('all');
  });

  it('reusar caché se traduce en refresh=false', () => {
    const config = { ...defaultRunConfig(), reuseCache: true, seed: 7, scenarioId: 'rain' };
    expect(jobRequestFor(config)).toEqual({ scenarioId: 'rain', seed: 7, refresh: false });
  });

  it('reconoce el job servido desde la caché', () => {
    const config = { ...defaultRunConfig(), reuseCache: true };
    expect(
      wasServedFromCache(
        snapshot({ status: 'completed', phase: 'caché reutilizada' }),
        config,
      ),
    ).toBe(true);
    // Sin la casilla marcada, un job completado es una ejecución real.
    expect(
      wasServedFromCache(
        snapshot({ status: 'completed', phase: 'caché reutilizada' }),
        defaultRunConfig(),
      ),
    ).toBe(false);
  });

  it('el polling respeta la ventana de 1–2 s del plan', () => {
    expect(CALIBRATION_POLL_MS).toBeGreaterThanOrEqual(1000);
    expect(CALIBRATION_POLL_MS).toBeLessThanOrEqual(2000);
  });
});

describe('calibración — progreso, k/total y ETA (Fase 5)', () => {
  it('reporta la corrida en curso sobre el total', () => {
    const running = snapshot({ status: 'running', current: 5, total: 18, currentLabel: '20 hormigas' });
    expect(runCounterLabel(running)).toBe('5/18');
    expect(runPhaseLabel(running)).toBe('[5/18] 20 hormigas');
  });

  it('sin total no inventa un contador', () => {
    expect(runCounterLabel(snapshot())).toBeNull();
    expect(runPhaseLabel(snapshot({ phase: 'Sensibilidad ACO' }))).toBe('Sensibilidad ACO');
  });

  it('acota el porcentaje a [0, 100]', () => {
    expect(progressPercent(null)).toBe(0);
    expect(progressPercent(snapshot({ progress: 134 }))).toBe(100);
    expect(progressPercent(snapshot({ progress: -3 }))).toBe(0);
    expect(progressPercent(snapshot({ progress: 23.4 }))).toBe(23);
  });

  it('estima el tiempo restante a partir del avance real', () => {
    const started = new Date('2026-09-17T10:00:00.000Z').getTime();
    const running = snapshot({ status: 'running', progress: 25, startedAt: '2026-09-17T10:00:00.000Z' });

    // 100 s transcurridos al 25 % → faltan ~300 s.
    expect(etaSeconds(running, started + 100_000)).toBe(300);
    expect(formatEta(300)).toBe('5 min');
    expect(formatEta(45)).toBe('45 s');
    expect(formatEta(3720)).toBe('1 h 2 min');
  });

  it('no estima ETA sin avance, sin fecha de inicio o con el job terminado', () => {
    const started = new Date('2026-09-17T10:00:00.000Z').getTime();
    expect(etaSeconds(snapshot({ status: 'running', progress: 0, startedAt: '2026-09-17T10:00:00.000Z' }), started)).toBeNull();
    expect(etaSeconds(snapshot({ status: 'running', progress: 25 }), started)).toBeNull();
    expect(
      etaSeconds(
        snapshot({ status: 'completed', progress: 100, startedAt: '2026-09-17T10:00:00.000Z' }),
        started,
      ),
    ).toBeNull();
    expect(etaSeconds(null, started)).toBeNull();
  });

  it('etiqueta y colorea cada estado del job', () => {
    expect(statusLabelKey('cancelled')).toBe('calibration.standing.cancelled');
    expect(statusLabelKey(null)).toBe('calibration.standing.idle');
    expect(statusVariant('completed')).toBe('success');
    expect(statusVariant('failed')).toBe('danger');
    expect(statusVariant('cancelled')).toBe('warning');
    expect(statusVariant('running')).toBe('info');
    expect(statusVariant(null)).toBe('default');
  });
});
