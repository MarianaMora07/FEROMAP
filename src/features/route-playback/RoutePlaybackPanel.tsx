import { Show } from 'solid-js';
import { X, CloudRain, Truck, MapPin, Route } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackControls } from './RoutePlaybackControls';
import type { ScenarioId } from '../../data/types/simulation';

export interface RoutePlaybackPanelProps {
  routes: RoutePlaybackModel[];
  playback: RoutePlaybackController;
  scenarioId: ScenarioId;
  scenarioLabel: string;
  operationDate: string;
  previewMode?: boolean;
  title?: string;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  /** Panel flotante absoluto (optimización) vs inline en layout */
  variant?: 'overlay' | 'inline';
}

export function RoutePlaybackPanel(props: RoutePlaybackPanelProps) {
  const vehicleCount = () => props.routes.length;
  const stopCount = () => props.routes.reduce((sum, route) => sum + route.stops.length, 0);
  const landfillStops = () =>
    props.routes.reduce(
      (sum, route) => sum + route.stops.filter((stop) => stop.stopType === 'landfill').length,
      0,
    );

  const shellClass = () =>
    props.variant === 'inline'
      ? 'flex w-full flex-col rounded-xl border border-default bg-elevated shadow-sm'
      : 'absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-default bg-elevated shadow-xl sm:max-w-md';

  return (
    <div
      class={shellClass()}
      data-testid="route-playback-panel"
      role="dialog"
      aria-label={props.title ?? 'Simular recorrido'}
    >
      <div class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
        <div>
          <h3 class="font-heading text-base font-semibold text-text-primary">
            {props.title ?? 'Simular recorrido'}
          </h3>
          <p class="text-xs text-text-muted">{props.operationDate}</p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-default text-text-secondary hover:bg-app"
          aria-label="Cerrar simulación"
          onClick={() => props.onClose()}
        >
          <X size={16} />
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <Show when={props.loading}>
          <p class="text-sm text-text-muted">Cargando geometría de rutas…</p>
        </Show>

        <Show when={props.error}>
          <p class="text-sm text-red-600">{props.error}</p>
        </Show>

        <Show when={!props.loading && !props.error}>
          <Card>
            <CardHeader title="Resumen del escenario" />
            <ul class="space-y-2.5 text-sm">
              <li class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-text-secondary">
                  <CloudRain size={15} class="text-fero-blue" />
                  Escenario
                </span>
                <span class="font-semibold text-text-primary">{props.scenarioLabel}</span>
              </li>
              <li class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-text-secondary">
                  <Truck size={15} class="text-fero-blue" />
                  Vehículos
                </span>
                <span class="font-semibold text-text-primary">{vehicleCount()}</span>
              </li>
              <li class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-text-secondary">
                  <MapPin size={15} class="text-fero-blue" />
                  Paradas
                </span>
                <span class="font-semibold text-text-primary">{stopCount()}</span>
              </li>
              <Show when={landfillStops() > 0}>
                <li class="flex items-center justify-between gap-3">
                  <span class="flex items-center gap-2 text-text-secondary">
                    <span aria-hidden="true">♻</span>
                    Vertederos
                  </span>
                  <span class="font-semibold text-text-primary">{landfillStops()}</span>
                </li>
              </Show>
              <li class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-text-secondary">
                  <Route size={15} class="text-fero-blue" />
                  Modo
                </span>
                <Badge variant={props.previewMode ? 'info' : 'success'}>
                  {props.previewMode ? 'Preview (sin despacho)' : 'Operativo'}
                </Badge>
              </li>
            </ul>
            <p class="mt-3 text-xs text-text-muted">
              Escenario: <span class="font-mono">{props.scenarioId}</span>
            </p>
          </Card>

          <RoutePlaybackControls playback={props.playback} routes={props.routes} compact />

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Rutas</p>
            <ul class="space-y-2">
              {props.routes.map((route) => (
                <li
                  class="rounded-lg border border-default px-3 py-2 text-sm"
                  style={{ 'border-left': `3px solid ${route.color}` }}
                >
                  <p class="font-semibold text-text-primary">{route.vehicleLabel}</p>
                  <p class="text-xs text-text-muted">
                    {route.stops.length} paradas · {route.totalDurationMinutes} min estimados
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Show>
      </div>

      <div class="border-t border-default p-4">
        <Button type="button" variant="outline" class="w-full" onClick={() => props.onClose()}>
          Cerrar recorrido
        </Button>
      </div>
    </div>
  );
}
