import { Show } from 'solid-js';
import { ProgressBar } from '../../design-system/components';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

interface OperatorJourneyStripProps {
  operationDate: string;
  vehicleId?: string | null;
  routeLabel?: string | null;
  statusLabel: string;
  planStatus?: string | null;
  progress: number;
  nextPoint?: string | null;
}

export function OperatorJourneyStrip(props: OperatorJourneyStripProps) {
  return (
    <div
      class="rounded-lg border border-default bg-elevated px-3 py-2.5"
      data-testid="operator-journey-strip"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
        <span class="font-semibold text-text-primary dark:text-white">{props.operationDate}</span>
        <span class="text-text-muted" aria-hidden="true">
          ·
        </span>
        <span>
          Vehículo{' '}
          <span class="font-semibold text-text-primary dark:text-white">{props.vehicleId ?? '—'}</span>
        </span>
        <span class="text-text-muted" aria-hidden="true">
          ·
        </span>
        <span>{props.routeLabel ?? 'Sin ruta'}</span>
        <span class="text-text-muted" aria-hidden="true">
          ·
        </span>
        <span class="font-medium text-text-primary dark:text-white">{props.statusLabel}</span>
        <Show when={props.planStatus}>
          <PlanningStatusBadge status={props.planStatus!} />
        </Show>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <div class="min-w-40 flex-1">
          <div class="mb-1 flex items-center justify-between text-xs text-text-muted">
            <span>Avance</span>
            <span class="font-semibold text-text-primary dark:text-white">{props.progress}%</span>
          </div>
          <ProgressBar value={props.progress} color="green" size="sm" />
        </div>
        <Show when={props.nextPoint}>
          <p class="text-xs text-text-secondary">
            Próxima parada:{' '}
            <span class="font-semibold text-text-primary dark:text-white">{props.nextPoint}</span>
          </p>
        </Show>
      </div>
    </div>
  );
}
