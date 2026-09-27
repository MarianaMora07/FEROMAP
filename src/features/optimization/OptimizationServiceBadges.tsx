import { For, Show } from 'solid-js';
import { Badge } from '../../design-system/components';
import type { KpiMetrics } from '../../data/types/simulation';

function fmtHours(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${value.toLocaleString('es-VE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

function fmtPct(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${value.toLocaleString('es-VE', { maximumFractionDigits: 1 })} %`;
}

function fmtIndex(value: number | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Variante del badge de equidad según el índice (0–1). */
function fairnessVariant(fairnessIndex: number | undefined): 'success' | 'warning' | 'danger' {
  if (fairnessIndex === undefined) return 'warning';
  if (fairnessIndex >= 0.85) return 'success';
  if (fairnessIndex >= 0.6) return 'warning';
  return 'danger';
}

/** Variante del badge de cumplimiento de jornada objetivo. */
function targetVariant(pct: number | undefined): 'success' | 'warning' | 'danger' {
  if (pct === undefined) return 'warning';
  if (pct >= 90) return 'success';
  if (pct >= 50) return 'warning';
  return 'danger';
}

interface OptimizationServiceBadgesProps {
  kpis: KpiMetrics;
}

/**
 * Fase 13 — insignias de servicio: uso de flota, duración y equidad.
 *
 * Solo se renderiza cuando el motor reporta los KPIs aditivos (Fase 13); en corridas
 * previas o sin ellos no ocupa espacio.
 */
export function OptimizationServiceBadges(props: OptimizationServiceBadgesProps) {
  const hasServiceKpis = () =>
    props.kpis.activeVehicles !== undefined || props.kpis.fairnessIndex !== undefined;

  return (
    <Show when={hasServiceKpis()}>
      <div
        class="flex flex-wrap items-center gap-2"
        data-testid="optimization-service-badges"
      >
        <For
          each={[
            {
              key: 'fleet',
              variant: 'info' as const,
              label: `Flota: ${props.kpis.activeVehicles ?? '—'} camión(es) · ${fmtPct(
                props.kpis.fleetUtilizationPct,
              )}`,
            },
            {
              key: 'fairness',
              variant: fairnessVariant(props.kpis.fairnessIndex),
              label: `Equidad: ${fmtIndex(props.kpis.fairnessIndex)} (σ ${fmtHours(
                props.kpis.workloadStdHours,
              )})`,
            },
            {
              key: 'makespan',
              variant: 'default' as const,
              label: `Ruta más larga: ${fmtHours(props.kpis.maxRouteHours)} · holgura ${fmtHours(
                props.kpis.shiftSlackHours,
              )}`,
            },
            {
              key: 'target',
              variant: targetVariant(props.kpis.finishUnderTargetPct),
              label: `≤ ${fmtHours(props.kpis.maxRouteHoursTarget)}: ${fmtPct(
                props.kpis.finishUnderTargetPct,
              )}`,
            },
          ]}
        >
          {(badge) => (
            <Badge variant={badge.variant} dot>
              {badge.label}
            </Badge>
          )}
        </For>
      </div>
    </Show>
  );
}
