import { describe, expect, it } from 'vitest';
import type { AcoSensitivityPayload, ObjectiveSweepPayload } from '../../core/api/benchmark';
import {
  calibrationFilename,
  csvCell,
  csvLines,
  jsonText,
  objectiveRunsCsv,
  sensitivityAxisCsv,
} from './calibrationExport';

const sensitivityPayload: AcoSensitivityPayload = {
  generatedAt: '2026-09-17T15:29:10.773909+00:00',
  durationSeconds: 315.4,
  scenarioId: 'normal',
  seed: 42,
  standardProfile: { acoAnts: 12, acoIterations: 20 },
  runs: [
    {
      label: 'β 1',
      scenarioId: 'normal',
      acoAnts: 12,
      acoIterations: 20,
      axis: 'beta',
      acoBeta: 1,
      distanceKmOptimized: 237.6,
      distanceKmBaseline: 506.6,
      savingPct: 53.1,
      computationSeconds: 3.2,
      acoIterationsRun: 8,
      acoStoppedEarly: true,
      uncoveredPoints: 0,
    },
    {
      label: 'β 5',
      scenarioId: 'normal',
      acoAnts: 12,
      acoIterations: 20,
      axis: 'beta',
      acoBeta: 5,
      distanceKmOptimized: 184.7,
      distanceKmBaseline: 506.6,
      savingPct: 63.5,
      computationSeconds: 4.65,
      acoIterationsRun: 19,
      acoStoppedEarly: false,
      uncoveredPoints: 0,
    },
    {
      label: 'β 0 (rota)',
      scenarioId: 'normal',
      acoAnts: 12,
      acoIterations: 20,
      axis: 'beta',
      acoBeta: 0,
      error: 'sin solución factible',
    },
  ],
};

const objectivePayload: ObjectiveSweepPayload = {
  generatedAt: '2026-09-15T17:55:35.371088+00:00',
  durationSeconds: 215.4,
  scenarioId: 'normal',
  seed: 42,
  maxRouteHoursTarget: 8,
  runs: [
    {
      label: 'base 8 h (w=0)',
      durationHours: 8,
      workloadBalanceWeight: 0,
      makespanWeight: 0,
      minActiveVehiclesRequested: null,
      distanceKmOptimized: 140.6,
      activeVehicles: 6,
      maxRouteHours: 8.09,
      shiftSlackHours: 3.91,
      finishUnderTargetPct: 66.7,
      workloadStdHours: 1.2,
      fairnessIndex: 0.84,
      uncoveredPoints: 0,
      computationSeconds: 2.53,
    },
    {
      label: 'barrido roto',
      durationHours: 8,
      workloadBalanceWeight: 1,
      makespanWeight: 0,
      minActiveVehiclesRequested: null,
      error: 'excepción del motor',
    },
  ],
  paretoFrontier: [],
  acceptance: {
    ac1: { criterion: 'x', acceptedPoint: null, checks: [], exceptions: [], ok: false },
    ac2: { criterion: 'y', candidates: [], ok: false },
    ac3: { criterion: 'z', evidence: 'test', ok: null },
  },
};

describe('export de calibración (Fase 8)', () => {
  it('serializa el payload crudo como JSON indentado', () => {
    const text = jsonText(sensitivityPayload);

    expect(JSON.parse(text)).toEqual(sensitivityPayload);
    expect(text.split('\n')[0]).toBe('{');
    expect(text).toContain('\n  "scenarioId": "normal"');
  });

  it('escapa comillas, comas y saltos de línea en el CSV', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell('con, coma')).toBe('"con, coma"');
    expect(csvCell('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvCell('dos\nlíneas')).toBe('"dos\nlíneas"');
  });

  it('arma el CSV con encabezado y una fila por corrida del eje', () => {
    const lines = sensitivityAxisCsv(sensitivityPayload, 'beta').split('\n');

    expect(lines[0]).toBe(
      'eje,nivel,distancia_km_optimizada,distancia_km_base,ahorro_pct,cpu_s,iteraciones_ejecutadas,early_stop,puntos_no_cubiertos',
    );
    // Ordenado por distancia (ranking) y con las excluidas al final.
    expect(lines[1]).toContain('β 5,184.7');
    expect(lines[2]).toContain('β 1,237.6');
    expect(lines[3]).toContain('β 0 (rota)');
    expect(lines).toHaveLength(4);
  });

  it('exporta solo corridas válidas del barrido de pesos', () => {
    const lines = objectiveRunsCsv(objectivePayload).split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'caso,jornada_h,pesos,distancia_km_optimizada,ahorro_pct,vehiculos_activos,max_horas_ruta,holgura_h,termina_bajo_objetivo_pct,sigma_horas,equidad,puntos_no_cubiertos,cpu_s',
    );
    expect(lines[1]).toContain('base 8 h (w=0),8,λb 0 · λt 0,140.6,,6');
    expect(lines.join('\n')).not.toContain('barrido roto');
  });

  it('construye nombres de archivo estables y auditables', () => {
    expect(
      calibrationFilename('sensitivity', '2026-09-17T15:29:10.773909+00:00', 'csv'),
    ).toBe('calibracion-sensitivity-2026-09-17-15-29-10.csv');
    expect(calibrationFilename('objective', '2026-09-15T17:55:35+00:00', 'json')).toBe(
      'calibracion-objective-2026-09-15-17-55-35.json',
    );
  });

  it('une encabezados y filas con comas', () => {
    expect(csvLines(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\n1,2\n3,4');
  });
});
