import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle } from 'lucide-solid';
import { Card, CardHeader, ProgressBar } from '../../design-system/components';
import { dashboardView } from '../../core/stores/dashboardStore';
import {
  ZONE_ATTENTION_LIMIT,
  rankZonesByAttention,
  zoneAttentionHref,
} from './zoneAttentionUx';

/**
 * Ranking de zonas que concentran más contenedores críticos y en rebose.
 *
 * Reutiliza el agregado por zona que ya calcula `dashboard_summary`
 * (`sectorFillLevels`), de modo que el planificador vea *dónde* actuar y no solo
 * el total de contenedores.
 */
export function ZoneAttentionPanel() {
  const zones = () =>
    rankZonesByAttention(dashboardView()?.summary?.sectorFillLevels ?? [], ZONE_ATTENTION_LIMIT);

  return (
    <Card class="w-full" data-testid="zone-attention-panel">
      <CardHeader
        title="Zonas que requieren más atención"
        subtitle={`Top ${ZONE_ATTENTION_LIMIT} por contenedores críticos, rebose y llenado medio`}
        action={
          <A href="/collection-points" class="text-xs font-medium text-fero-blue hover:underline">
            Ver todas
          </A>
        }
      />
      <Show
        when={zones().length > 0}
        fallback={<p class="text-sm text-text-secondary">Todavía no hay datos de zonas.</p>}
      >
        <ul class="space-y-2">
          <For each={zones()}>
            {(zone) => (
              <li>
                <A
                  href={zoneAttentionHref(zone.name)}
                  class="-mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-app"
                  data-testid="zone-attention-row"
                >
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-sm font-medium text-text-primary dark:text-white">
                      {zone.name}
                    </span>
                    <span class="shrink-0 text-sm font-semibold text-text-primary">{zone.pct}%</span>
                  </div>
                  <ProgressBar value={zone.pct} size="sm" class="mt-1.5" />
                  <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span>
                      {(zone.criticalCount ?? 0)} crítico{(zone.criticalCount ?? 0) === 1 ? '' : 's'}
                    </span>
                    <Show when={(zone.overflowCount ?? 0) > 0}>
                      <span class="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={12} />
                        {zone.overflowCount} en rebose
                      </span>
                    </Show>
                  </div>
                </A>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Card>
  );
}
