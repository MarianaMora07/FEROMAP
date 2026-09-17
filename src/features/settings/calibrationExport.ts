/**
 * Export de la calibración del motor (Fase 13, §Fase 8): JSON crudo del payload y CSV de
 * la tabla mostrada. El CSV coincide con lo que se ve en pantalla (mismas filas y
 * columnas), para que la evidencia sea auditable.
 */

import type {
  AcoSensitivityPayload,
  AcoSensitivityRun,
  CalibrationAxis,
  ObjectiveSweepPayload,
  ObjectiveSweepRun,
} from '../../core/api/benchmark';
import { axisRuns, isValidRun, rankedRuns } from './calibrationSensitivityUx';
import { isValidObjectiveRun, tableRows, weightsLabel } from './calibrationObjectiveUx';

const SENSITIVITY_HEADERS = [
  'eje',
  'nivel',
  'distancia_km_optimizada',
  'distancia_km_base',
  'ahorro_pct',
  'cpu_s',
  'iteraciones_ejecutadas',
  'early_stop',
  'puntos_no_cubiertos',
];

const OBJECTIVE_HEADERS = [
  'caso',
  'jornada_h',
  'pesos',
  'distancia_km_optimizada',
  'vehiculos_activos',
  'max_horas_ruta',
  'holgura_h',
  'termina_bajo_objetivo_pct',
  'sigma_horas',
  'equidad',
  'puntos_no_cubiertos',
  'cpu_s',
];

/** Escapa una celda CSV: comillas dobles y separadores. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : String(value);
  if (/[",;\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvLines(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function jsonText(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/** Fila del CSV de sensibilidad, en el orden de la tabla del eje. */
export function sensitivityCsvRow(run: AcoSensitivityRun): unknown[] {
  return [
    run.axis,
    run.label,
    run.distanceKmOptimized,
    run.distanceKmBaseline,
    run.savingPct,
    run.computationSeconds,
    run.acoIterationsRun,
    run.acoStoppedEarly ? 'sí' : 'no',
    run.uncoveredPoints ?? 0,
  ];
}

/** CSV del eje seleccionado: corridas válidas (ordenadas) y luego las excluidas. */
export function sensitivityAxisCsv(
  payload: AcoSensitivityPayload,
  axis: CalibrationAxis,
): string {
  const ranked = rankedRuns(payload.runs, axis);
  const excluded = axisRuns(payload.runs, axis).filter((run) => !isValidRun(run));
  return csvLines(SENSITIVITY_HEADERS, [...ranked, ...excluded].map(sensitivityCsvRow));
}

export function objectiveCsvRow(run: ObjectiveSweepRun): unknown[] {
  return [
    run.label,
    run.durationHours ?? 'defecto',
    weightsLabel(run),
    run.distanceKmOptimized,
    run.activeVehicles,
    run.maxRouteHours,
    run.shiftSlackHours,
    run.finishUnderTargetPct,
    run.workloadStdHours,
    run.fairnessIndex,
    run.uncoveredPoints ?? 0,
    run.computationSeconds,
  ];
}

export function objectiveRunsCsv(payload: ObjectiveSweepPayload): string {
  return csvLines(
    OBJECTIVE_HEADERS,
    tableRows(payload)
      .filter(isValidObjectiveRun)
      .map(objectiveCsvRow),
  );
}

/** Nombre de archivo estable, con la fecha de generación del payload. */
export function calibrationFilename(
  kind: 'sensitivity' | 'objective',
  generatedAt: string,
  extension: 'json' | 'csv',
): string {
  const stamp = generatedAt.slice(0, 19).replace(/[:T]/g, '-');
  return `calibracion-${kind}-${stamp}.${extension}`;
}

/** Descarga un texto como archivo. Efecto DOM (no se ejecuta en los tests node). */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
