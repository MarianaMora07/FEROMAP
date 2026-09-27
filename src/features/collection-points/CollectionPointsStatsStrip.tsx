import { For, Show } from 'solid-js';
import { Trash2 } from 'lucide-solid';
import type { CollectionPointKpi } from '../../core/utils/collectionPointsUtils';

interface CollectionPointsStatsStripProps {
  kpis: CollectionPointKpi[];
  loading: boolean;
}

export function CollectionPointsStatsStrip(props: CollectionPointsStatsStripProps) {
  return (
    <div
      class="grid grid-cols-2 gap-2 rounded-xl border border-border bg-elevated px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-4 dark:border-dark-border"
      data-testid="collection-points-stats"
    >
      <Show
        when={!props.loading}
        fallback={
          <For each={Array.from({ length: 4 })}>
            {() => <div class="h-12 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />}
          </For>
        }
      >
        <For each={props.kpis}>
          {(kpi) => (
            <div class="flex items-start gap-2 rounded-md px-2 py-1">
              <span class="mt-0.5 text-fero-green-dark">
                <Trash2 size={16} />
              </span>
              <div class="min-w-0">
                <p class="truncate text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {kpi.title}
                </p>
                <p class="font-heading text-lg font-bold leading-tight text-text-primary dark:text-white">
                  {kpi.value}
                  <Show when={kpi.unit}>
                    <span class="ml-1 text-xs font-medium text-text-muted">{kpi.unit}</span>
                  </Show>
                </p>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
