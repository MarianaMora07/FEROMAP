import { Show } from 'solid-js';
import { X } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import type { DailyPlan } from '../../core/api/planning';
import type { PlaybackCameraMode } from '../../core/route-playback/playbackCameraUx';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { dailyPlanStatusLabel } from '../../core/map/mapPlaybackUx';
import { PlaybackCameraControls } from '../route-playback/PlaybackCameraControls';
import { RoutePlaybackControls } from '../route-playback/RoutePlaybackControls';

export interface MapPlaybackPanelProps {
  routes: RoutePlaybackModel[];
  playback: RoutePlaybackController;
  operationDate: string;
  dailyPlan?: DailyPlan | null;
  previewMode?: boolean;
  cameraMode: PlaybackCameraMode;
  onCameraModeChange: (mode: PlaybackCameraMode) => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

export function MapPlaybackPanel(props: MapPlaybackPanelProps) {
  const landfillStops = () =>
    props.routes.reduce(
      (sum, route) => sum + route.stops.filter((stop) => stop.stopType === 'landfill').length,
      0,
    );

  return (
    <aside
      class="absolute inset-y-16 right-0 z-30 flex w-full max-w-sm flex-col border-l border-default bg-elevated/98 shadow-xl backdrop-blur-md sm:max-w-md"
      data-testid="map-playback-panel"
      role="dialog"
      aria-label="Recorrido en mapa GIS"
    >
      <div class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
        <div>
          <h3 class="font-heading text-base font-semibold text-text-primary">Recorrido operativo</h3>
          <p class="text-xs text-text-muted">{props.operationDate}</p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-default text-text-secondary hover:bg-app"
          aria-label="Cerrar recorrido"
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
            <CardHeader title="Plan del día" />
            <ul class="space-y-2 text-sm">
              <li class="flex items-center justify-between gap-3">
                <span class="text-text-secondary">Estado</span>
                <Badge variant={props.previewMode ? 'info' : 'success'}>
                  {props.dailyPlan
                    ? dailyPlanStatusLabel(props.dailyPlan.status)
                    : props.previewMode
                      ? 'Preview'
                      : 'Operativo'}
                </Badge>
              </li>
              <li class="flex items-center justify-between gap-3">
                <span class="text-text-secondary">Rutas visibles</span>
                <span class="font-semibold text-text-primary">{props.routes.length}</span>
              </li>
              <Show when={landfillStops() > 0}>
                <li class="flex items-center justify-between gap-3">
                  <span class="text-text-secondary">Vertederos</span>
                  <span class="font-semibold text-text-primary">
                    <span aria-hidden="true">♻ </span>
                    {landfillStops()}
                  </span>
                </li>
              </Show>
            </ul>
          </Card>

          <PlaybackCameraControls
            mode={props.cameraMode}
            onModeChange={props.onCameraModeChange}
            disabled={props.routes.length === 0}
          />

          <Show when={props.routes.length > 0}>
            <RoutePlaybackControls playback={props.playback} routes={props.routes} compact />
          </Show>
        </Show>
      </div>

      <div class="border-t border-default p-4">
        <Button type="button" variant="outline" class="w-full" onClick={() => props.onClose()}>
          Cerrar recorrido
        </Button>
      </div>
    </aside>
  );
}
