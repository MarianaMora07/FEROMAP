/**
 * Utilidades de fecha ISO (sin dependencias) para el cálculo de semanas.
 *
 * Importante: se opera en fecha **local**. `new Date('YYYY-MM-DD')` se interpreta
 * en UTC y, en zonas detrás de UTC (p. ej. Venezuela), al combinarlo con getters
 * locales el lunes de una fecha se corría varios días. Parsear y formatear en
 * local mantiene el cálculo alineado con el backend, que usa el lunes como inicio
 * de semana (`week_range`).
 */

export function parseIsoDateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Lunes de la semana de una fecha (o de hoy). */
export function mondayIso(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? parseIsoDateLocal(value) : new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatIsoDateLocal(date);
}

/** Suma (o resta) semanas a un lunes ISO dado. */
export function addWeeksToMonday(weekStartIso: string, weeks: number): string {
  const date = parseIsoDateLocal(weekStartIso);
  date.setDate(date.getDate() + weeks * 7);
  return formatIsoDateLocal(date);
}
