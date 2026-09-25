import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Card, ProgressBar, StatusBadge } from '../../design-system/components';
import { PlanningEmptyState, type PlanningEmptyStateProps } from '../planning/PlanningEmptyState';
import type { FleetLiveStatus, LiveVehicle } from '../../data/mock/monitoring';

function statusForBadge(status: FleetLiveStatus) {
  return status;
}

interface MonitoringFleetListProps {
  fleet: LiveVehicle[];
  selectedId: string;
  onSelect: (vehicle: LiveVehicle) => void;
  emptyPreset: Omit<PlanningEmptyStateProps, 'compact'>;
}

export function MonitoringFleetList(props: MonitoringFleetListProps) {
  return (
    <Card padding={false} class="flex max-h-125 flex-col overflow-hidden xl:col-span-2 xl:max-h-none xl:h-full">
      <div class="flex items-center justify-between border-b border-default px-4 py-3">
        <h3 class="font-heading font-semibold text-text-primary">Estado de la flota</h3>
        <A href="/vehicles" class="text-xs font-medium text-fero-blue hover:underline">
          Ver todas
        </A>
      </div>
      <ul class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
        <Show
          when={props.fleet.length > 0}
          fallback={
            <li>
              <PlanningEmptyState {...props.emptyPreset} compact />
            </li>
          }
        >
        <For each={props.fleet}>
          {(v) => (
            <li>
              <button
                type="button"
                class={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app ${
                  props.selectedId === v.id ? 'bg-fero-green/5' : ''
                }`}
                onClick={() => props.onSelect(v)}
              >
                <img
                  src={v.image}
                  alt={v.id}
                  class="h-11 w-14 shrink-0 rounded-md object-cover bg-app"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <div class="min-w-0 flex-1">
                  <div class="mb-0.5 flex flex-wrap items-center gap-2">
                    <span class="text-sm font-semibold text-text-primary">{v.id}</span>
                    <StatusBadge status={statusForBadge(v.status)} />
                  </div>
                  <p class="truncate text-xs text-text-muted">{v.route}</p>
                  <p class="truncate text-xs text-text-secondary">{v.driver}</p>
                  <div class="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={v.progress} color="green" size="sm" class="min-w-0 flex-1" />
                    <span class="shrink-0 text-[11px] font-medium text-text-secondary">
                      {v.speedKmh == null ? '—' : `${v.speedKmh} km/h`}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )}
        </For>
        </Show>
      </ul>
    </Card>
  );
}
