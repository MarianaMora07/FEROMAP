import { For, Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, FileText, MapPin, Recycle } from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingPanel,
  ProgressBar,
} from '../../design-system/components';
import type { OperatorRouteSnapshot, OperatorRouteStop } from '../../core/api/operator';
import {
  operatorStopStatusLabel,
  operatorStopStatusVariant,
  isOperatorLandfillStop,
} from '../../core/api/operator';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { OPERATOR_EMPTY_PRESETS } from '../../core/operator/operatorEmptyStates';
import { operatorMapHref, operatorMonitoringHref } from '../../core/operator/operatorDeepLinks';
import { OperatorStopDrawer } from './OperatorStopDrawer';

interface OperatorRoutePanelProps {
  snapshot: OperatorRouteSnapshot | undefined;
  loading?: boolean;
  onRefresh?: () => void;
  vehicleId?: string | null;
  operationDate?: string;
}

function formatEstimatedTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

export function OperatorRoutePanel(props: OperatorRoutePanelProps) {
  const [selectedStop, setSelectedStop] = createSignal<OperatorRouteStop | null>(null);

  const linkParams = () => ({
    date: props.operationDate,
    vehicleId: props.vehicleId ?? props.snapshot?.vehicleId ?? undefined,
  });
  const hasStops = () => (props.snapshot?.stops.length ?? 0) > 0;
  const progressLabel = () => {
    const snapshot = props.snapshot;
    if (!snapshot) return '';
    const km =
      snapshot.remainingDistanceKm != null ? ` · ${snapshot.remainingDistanceKm} km restantes` : '';
    return `${snapshot.stopsDone} de ${snapshot.stopsTotal} paradas${km}`;
  };

  return (
    <Card data-testid="operator-route-panel" aria-busy={props.loading ? 'true' : 'false'}>
      <CardHeader
        title="Mi ruta del día"
        subtitle={props.snapshot?.routeLabel ?? 'Secuencia de paradas asignada'}
        action={
          <div class="flex items-center gap-3">
            <Show when={props.onRefresh}>
              <button
                type="button"
                class="text-xs font-medium text-fero-blue hover:underline"
                onClick={() => props.onRefresh?.()}
              >
                Actualizar
              </button>
            </Show>
            <A href="/operator/plan" class="text-xs font-medium text-fero-blue hover:underline">
              Ver plan del día
            </A>
          </div>
        }
      />

      <Show when={props.loading}>
        <LoadingPanel label="Cargando paradas…" indeterminate />
      </Show>

      <Show when={!props.loading && !hasStops()}>
        <PlanningEmptyState {...OPERATOR_EMPTY_PRESETS.noDispatchedRoute} compact />
      </Show>

      <Show when={!props.loading && hasStops()}>
        <div class="space-y-3">
          <div>
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
              <span>{progressLabel()}</span>
              <span class="font-semibold text-text-primary dark:text-white">
                {props.snapshot!.progress}%
              </span>
            </div>
            <ProgressBar value={props.snapshot!.progress} color="green" size="sm" />
          </div>

          <ol
            class="divide-y divide-border rounded-lg border border-border dark:divide-dark-border dark:border-dark-border"
            data-testid="operator-stops-stepper"
            aria-label="Secuencia de paradas del día"
          >
            <For each={props.snapshot!.stops}>
              {(stop) => {
                const isNext = () =>
                  stop.status === 'pending' &&
                  stop.waypointId === props.snapshot?.nextStop?.waypointId;
                const isLandfill = () => isOperatorLandfillStop(stop);
                return (
                  <li>
                    <button
                      type="button"
                      data-testid={`operator-stop-item-${stop.sequenceOrder}`}
                      aria-current={isNext() ? 'step' : undefined}
                      aria-label={`Parada ${stop.sequenceOrder}: ${isLandfill() ? 'Vertedero' : stop.code}, ${operatorStopStatusLabel(stop.status)}${isNext() ? ', siguiente parada' : ''}`}
                      class={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-hover dark:hover:bg-dark-surface/60 ${
                        isNext() ? 'bg-fero-blue/5 dark:bg-fero-blue/10' : ''
                      } ${isLandfill() ? 'border-l-4 border-stone-500' : ''}`}
                      onClick={() => setSelectedStop(stop)}
                    >
                      <span
                        class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          isLandfill()
                            ? 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100'
                            : isNext()
                              ? 'bg-fero-blue text-white'
                              : 'bg-surface-muted text-text-secondary dark:bg-dark-surface'
                        }`}
                      >
                        <Show when={isLandfill()} fallback={stop.sequenceOrder}>
                          <Recycle size={16} />
                        </Show>
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-semibold text-text-primary dark:text-white">
                            {isLandfill() ? 'Vertedero — descarga' : stop.code}
                          </p>
                          <Badge variant={operatorStopStatusVariant(stop.status)} size="sm">
                            {operatorStopStatusLabel(stop.status)}
                          </Badge>
                          <Show when={isNext()}>
                            <Badge variant="info" size="sm">
                              Siguiente
                            </Badge>
                          </Show>
                        </div>
                        <p class="mt-0.5 truncate text-xs text-text-muted">
                          {stop.sectorName ?? 'Sin sector'} · ETA {formatEstimatedTime(stop.estimatedArrivalAt)}
                        </p>
                      </div>
                      <ChevronRight size={16} class="shrink-0 text-text-muted" />
                    </button>
                  </li>
                );
              }}
            </For>
          </ol>

          <div class="flex flex-wrap gap-2 pt-1">
            <A href={operatorMonitoringHref(linkParams())}>
              <Button variant="outline" size="sm" class="gap-2">
                <MapPin size={14} />
                Abrir en monitoreo
              </Button>
            </A>
            <A href={operatorMapHref({ ...linkParams(), focus: 'route' })}>
              <Button variant="outline" size="sm" class="gap-2">
                <FileText size={14} />
                Mapa mi ruta
              </Button>
            </A>
          </div>
        </div>
      </Show>

      <OperatorStopDrawer
        stop={selectedStop()}
        open={selectedStop() != null}
        onClose={() => setSelectedStop(null)}
      />
    </Card>
  );
}
