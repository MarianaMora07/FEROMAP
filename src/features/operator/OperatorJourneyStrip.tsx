import { Show } from 'solid-js';
import { ProgressBar } from '../../design-system/components';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { formatNextStopLabel } from '../../core/utils/landfillUx';
import type { OperatorPlaybackSync } from '../../core/operator/operatorPlaybackUx';

interface OperatorJourneyStripProps {
  operationDate: string;
  vehicleId?: string | null;
  routeLabel?: string | null;
  statusLabel: string;
  planStatus?: string | null;
  progress: number;
  nextPoint?: string | null;
  nextStopType?: string | null;
  shiftUtilizationPct?: number | null;
  /** Cuando hay playback activo, sincroniza avance y próxima parada. */
  playbackSync?: OperatorPlaybackSync | null;
}

export function OperatorJourneyStrip(props: OperatorJourneyStripProps) {
  const progress = () => props.playbackSync?.progress ?? props.progress;
  const nextPoint = () => props.playbackSync?.nextPoint ?? props.nextPoint;
  const nextStopType = () => props.playbackSync?.nextStopType ?? props.nextStopType;
  const nextLabel = () => formatNextStopLabel(nextPoint(), nextStopType());

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
            <span>Avance de ruta</span>
            <span class="font-semibold text-text-primary dark:text-white">{progress()}%</span>
          </div>
          <ProgressBar value={progress()} color="green" size="sm" />
        </div>
        <Show when={props.shiftUtilizationPct != null}>
          <div class="min-w-36 flex-1">
            <div class="mb-1 flex items-center justify-between text-xs text-text-muted">
              <span>Jornada 06:00–18:00</span>
              <span class="font-semibold text-text-primary dark:text-white">
                {Math.round(props.shiftUtilizationPct!)}%
              </span>
            </div>
            <ProgressBar value={props.shiftUtilizationPct!} color="blue" size="sm" />
          </div>
        </Show>
        <Show when={nextPoint()}>
          <p class="text-xs text-text-secondary">
            Próxima parada:{' '}
            <span class="font-semibold text-text-primary dark:text-white">{nextLabel()}</span>
          </p>
        </Show>
      </div>
    </div>
  );
}
