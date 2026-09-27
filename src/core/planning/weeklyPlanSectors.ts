import type { WeeklyPlanDay } from '../api/planning';

export interface WeeklyPlanSectorRow {
  name: string;
  count: number;
}

export interface WeeklyPlanSectorPointRef {
  sectorName?: string | null;
}

/**
 * Agrupa los puntos programados de una jornada por sector para poder revisar
 * qué zonas se visitarán. Usa el resolvedor de puntos recibido (normalmente el
 * catálogo cargado en el store); los puntos sin sector se agrupan bajo
 * «Sin sector».
 */
export function buildWeeklyPlanSectorRows(
  day: Pick<WeeklyPlanDay, 'collectionPointIds'>,
  resolve: (pointId: number) => WeeklyPlanSectorPointRef | undefined,
): WeeklyPlanSectorRow[] {
  const counts = new Map<string, number>();
  let unresolved = 0;
  for (const pointId of day.collectionPointIds) {
    const name = resolve(pointId)?.sectorName?.trim();
    if (!name) {
      unresolved += 1;
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (unresolved > 0) rows.push({ name: 'Sin sector', count: unresolved });
  return rows;
}
