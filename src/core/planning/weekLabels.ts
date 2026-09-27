/**
 * Etiquetas de rango semanal en español para el chrome de planificación.
 *
 * El rango se calcula siempre desde el **lunes** de la semana (lunes + 6 días) en
 * fecha local, para que coincida con `week_range` del backend y no dependa del
 * locale del navegador.
 */

import { formatIsoDateLocal, parseIsoDateLocal } from './isoDate';

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function dayAndMonth(iso: string): { day: number; month: string } {
  const [, month, day] = iso.split('-').map(Number);
  return { day: day ?? 0, month: MONTHS_ES[(month ?? 1) - 1] ?? '' };
}

/** Domingo de la semana cuyo lunes es `weekStartIso` (fecha local). */
export function weekEndIso(weekStartIso: string): string {
  const date = parseIsoDateLocal(weekStartIso);
  date.setDate(date.getDate() + 6);
  return formatIsoDateLocal(date);
}

/**
 * Rango corto de una semana a partir de su lunes: `21–27 sep` si ambos extremos
 * caen en el mismo mes, o `28 sep – 4 oct` cuando la semana cruza de mes.
 */
export function formatWeekRangeLabel(weekStartIso: string): string {
  const start = dayAndMonth(weekStartIso);
  const end = dayAndMonth(weekEndIso(weekStartIso));
  if (start.month === end.month) return `${start.day}–${end.day} ${start.month}`;
  return `${start.day} ${start.month} – ${end.day} ${end.month}`;
}
