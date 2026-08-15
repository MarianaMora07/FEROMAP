import { For, Show } from 'solid-js';
import { Recycle } from 'lucide-solid';
import type { KpiMetrics } from '../../data/types/simulation';
import type { RouteCollection } from '../../core/types/geo';
import { landfillTripBadgeLabel, landfillTripsForRouteFeature } from '../../core/utils/landfillUx';

interface LandfillKpiStripProps {
  kpis?: KpiMetrics | null;
  routes?: RouteCollection | null;
}

export function LandfillKpiStrip(props: LandfillKpiStripProps) {
  const totalTrips = () => props.kpis?.landfillTrips ?? 0;
  const perRoute = () => {
    const routes = props.routes;
    if (!routes) return [];
    return routes.features
      .map((feature) => ({
        id: feature.properties.id,
        label: feature.properties.label,
        trips: landfillTripsForRouteFeature(feature),
      }))
      .filter((row) => row.trips > 0);
  };

  return (
    <Show when={totalTrips() > 0 || perRoute().length > 0}>
      <div class="flex flex-wrap items-center gap-2" data-testid="landfill-kpi-strip">
        <Show when={totalTrips() > 0}>
          <span class="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-800 dark:bg-stone-800/60 dark:text-stone-100">
            <Recycle size={14} />
            {landfillTripBadgeLabel(totalTrips())}
          </span>
        </Show>
        <For each={perRoute()}>
          {(route) => (
            <span class="inline-flex items-center gap-1 rounded-full border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:border-stone-600 dark:text-stone-200">
              {route.label}: {landfillTripBadgeLabel(route.trips)}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
