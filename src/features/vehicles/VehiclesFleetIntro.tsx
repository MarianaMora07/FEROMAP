import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import type { VehicleKpi } from '../../core/api/vehicles';

interface VehiclesFleetIntroProps {
  assignableCount: number;
  simulationHref: string;
  showSimulationLink: boolean;
  showDriversLink: boolean;
}

export function VehiclesFleetIntro(props: VehiclesFleetIntroProps) {
  return (
    <div
      class="flex flex-col gap-2 rounded-lg border border-default bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      data-testid="vehicles-fleet-intro"
    >
      <p class="text-sm text-text-secondary">
        Catálogo de flota — estado, conductores y disponibilidad para simulación u operación del día.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={props.showDriversLink}>
          <A
            href="/drivers"
            class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
          >
            Conductores
            <ArrowRight size={14} aria-hidden="true" />
          </A>
        </Show>
        <A
          href="/monitoring"
          class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
        >
          Monitoreo en vivo
          <ArrowRight size={14} aria-hidden="true" />
        </A>
        <Show when={props.showSimulationLink}>
          <A
            href={props.simulationHref}
            class="inline-flex items-center gap-1 rounded-full border border-default bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-violet-300/60 hover:text-text-primary dark:hover:border-violet-800/40"
          >
            Simular escenarios
            <Show when={props.assignableCount > 0}>
              <span class="text-text-muted">({props.assignableCount} asignables)</span>
            </Show>
            <ArrowRight size={12} aria-hidden="true" />
          </A>
        </Show>
      </div>
    </div>
  );
}

interface FleetStatsStripProps {
  kpis: VehicleKpi[];
  loading: boolean;
}

export function FleetStatsStrip(props: FleetStatsStripProps) {
  return (
    <div
      class="grid grid-cols-2 gap-2 rounded-lg border border-default bg-elevated px-3 py-2.5 sm:grid-cols-4"
      data-testid="vehicles-fleet-stats"
    >
      <Show
        when={!props.loading}
        fallback={
          <>
            <For each={Array.from({ length: 4 })}>
              {() => <div class="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />}
            </For>
          </>
        }
      >
        <For each={props.kpis}>
          {(kpi) => (
            <div class={kpi.highlight ? 'rounded-md bg-fero-green/5 px-2 py-1' : 'px-2 py-1'}>
              <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{kpi.title}</p>
              <p class="mt-0.5 text-lg font-bold text-text-primary dark:text-white">
                {kpi.value}
                <span class="ml-1 text-xs font-medium text-text-muted">{kpi.unit}</span>
              </p>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
