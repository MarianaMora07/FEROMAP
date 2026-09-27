import type { DashboardSectorFill } from '../../core/api/dashboard';

/** Cuántas zonas muestra el panel de atención. */
export const ZONE_ATTENTION_LIMIT = 5;

const criticalCount = (zone: DashboardSectorFill) => zone.criticalCount ?? 0;
const overflowCount = (zone: DashboardSectorFill) => zone.overflowCount ?? 0;

/**
 * Ordena las zonas por atención requerida y devuelve las primeras ``limit``.
 *
 * Criterio: más contenedores críticos, luego más contenedores en rebose y, por
 * último, mayor llenado medio. El desempate final es alfabético para que el
 * orden sea estable entre renders.
 */
export function rankZonesByAttention(
  zones: readonly DashboardSectorFill[],
  limit: number = ZONE_ATTENTION_LIMIT,
): DashboardSectorFill[] {
  return [...zones]
    .sort(
      (a, b) =>
        criticalCount(b) - criticalCount(a) ||
        overflowCount(b) - overflowCount(a) ||
        b.pct - a.pct ||
        a.name.localeCompare(b.name),
    )
    .slice(0, Math.max(0, limit));
}

/** Deep link a la lista de puntos ya filtrada por la zona. */
export function zoneAttentionHref(name: string): string {
  return `/collection-points?sector=${encodeURIComponent(name)}`;
}
