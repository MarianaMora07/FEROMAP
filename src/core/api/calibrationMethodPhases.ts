/**
 * Fases del protocolo metodológico de calibración (C0–C8).
 *
 * Módulo **sin dependencias de runtime** a propósito: los helpers de UX (`*Ux.ts`) importan de
 * aquí el listado de fases y no de `api/benchmark`, cuyo import arrastra el cliente HTTP y, con
 * él, el DOM (`Toast`). Un helper puro tiene que poder probarse en un entorno sin `window`.
 */

/** Las ocho fases del protocolo, en el orden en que se leen y se reportan. */
export type CalibrationMethodPhase =
  | 'noise'
  | 'factorial'
  | 'budget'
  | 'nocut'
  | 'identify'
  | 'validate'
  | 'objective'
  | 'rsm';

/**
 * Objetivo lanzable: una fase o **todo el protocolo** en un solo job.
 *
 * Con `all` el backend corre las ocho en orden (respetando dependencias) y devuelve la
 * evidencia ensamblada; con 10 semillas son horas de CPU, así que la vista avisa del coste.
 */
export type CalibrationMethodTarget = CalibrationMethodPhase | 'all';

export const CALIBRATION_METHOD_ALL: CalibrationMethodTarget = 'all';

export const CALIBRATION_METHOD_PHASES: readonly CalibrationMethodPhase[] = [
  'noise',
  'factorial',
  'budget',
  'nocut',
  'identify',
  'validate',
  'objective',
  'rsm',
];

/** Opciones del selector de objetivo: el protocolo completo primero, después cada fase. */
export const CALIBRATION_METHOD_TARGETS: readonly CalibrationMethodTarget[] = [
  CALIBRATION_METHOD_ALL,
  ...CALIBRATION_METHOD_PHASES,
];
