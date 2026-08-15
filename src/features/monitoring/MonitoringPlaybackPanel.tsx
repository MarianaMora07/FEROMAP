import { Show } from 'solid-js';
import { Play, X } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackControls } from '../route-playback/RoutePlaybackControls';
import type { MonitoringPlaybackMode } from '../../core/monitoring/monitoringPlaybackUx';

interface MonitoringPlaybackPanelProps {
  open: boolean;
  mode: MonitoringPlaybackMode;
  onModeChange: (mode: MonitoringPlaybackMode) => void;
  onClose: () => void;
  routes: RoutePlaybackModel[];
  playback: RoutePlaybackController;
  loading?: boolean;
  error?: string | null;
  fieldMode?: boolean;
}

export function MonitoringPlaybackPanel(props: MonitoringPlaybackPanelProps) {
  return (
    <Show when={props.open}>
      <Card class="border-fero-blue/30" data-testid="monitoring-playback-panel">
        <div class="flex items-start justify-between gap-3">
          <CardHeader
            title="Reproducir ruta"
            subtitle={
              props.fieldMode
                ? 'Animación fluida de tu ruta activa'
                : 'Animación fluida de rutas en ejecución'
            }
          />
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-default text-text-secondary hover:bg-app"
            aria-label="Cerrar reproducción"
            onClick={() => props.onClose()}
          >
            <X size={16} />
          </button>
        </div>

        <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Modo de reproducción">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              props.mode === 'visual'
                ? 'bg-fero-blue text-white'
                : 'bg-app text-text-secondary hover:bg-surface-hover'
            }`}
            onClick={() => props.onModeChange('visual')}
            aria-pressed={props.mode === 'visual'}
          >
            Solo visual (demo)
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              props.mode === 'hybrid'
                ? 'bg-fero-green-mid text-white'
                : 'bg-app text-text-secondary hover:bg-surface-hover'
            }`}
            onClick={() => props.onModeChange('hybrid')}
            aria-pressed={props.mode === 'hybrid'}
          >
            Híbrido (sincroniza BD)
          </button>
        </div>

        <p class="mb-3 text-xs text-text-muted">
          {props.mode === 'visual'
            ? 'El camión se mueve sobre la línea real sin modificar el progreso en base de datos. Use «Simular avance de flota» para avance operativo discreto.'
            : 'Al completar cada parada en la animación se registra el avance en el servidor.'}
        </p>

        <Show when={props.loading}>
          <p class="text-sm text-text-muted">Cargando rutas para reproducción…</p>
        </Show>

        <Show when={props.error}>
          <p class="text-sm text-red-600">{props.error}</p>
        </Show>

        <Show when={!props.loading && !props.error && props.routes.length > 0}>
          <RoutePlaybackControls playback={props.playback} routes={props.routes} compact />
        </Show>
      </Card>
    </Show>
  );
}

interface MonitoringPlaybackToggleProps {
  visible: boolean;
  open: boolean;
  onOpen: () => void;
  fieldMode?: boolean;
}

export function MonitoringPlaybackToggle(props: MonitoringPlaybackToggleProps) {
  return (
    <Show when={props.visible && !props.open}>
      <Button
        variant="secondary"
        size={props.fieldMode ? 'lg' : 'sm'}
        class={props.fieldMode ? 'min-h-12' : ''}
        icon={<Play size={props.fieldMode ? 18 : 16} />}
        onClick={() => props.onOpen()}
        data-testid="monitoring-playback-open"
      >
        Reproducir ruta
      </Button>
    </Show>
  );
}
