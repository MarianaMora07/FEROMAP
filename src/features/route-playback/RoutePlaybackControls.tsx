import { For, Show } from 'solid-js';
import { Pause, Play, RotateCcw } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import {
  ROUTE_PLAYBACK_SPEEDS,
  playbackCompletionSummary,
  simulatedClockLabel,
  type RoutePlaybackSpeed,
} from '../../core/route-playback/routePlaybackMath';

interface RoutePlaybackControlsProps {
  playback: RoutePlaybackController;
  routes: RoutePlaybackModel[];
  class?: string;
  compact?: boolean;
}

export function RoutePlaybackControls(props: RoutePlaybackControlsProps) {
  const progressPercent = () => Math.round(props.playback.progress() * 100);
  const clockLabel = () =>
    simulatedClockLabel(props.routes, props.playback.elapsedMs(), props.playback.routeStates());
  const completionSummary = () =>
    playbackCompletionSummary(props.routes, props.playback.maxDurationMs());

  return (
    <div
      class={`flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-sm ${props.class ?? ''}`}
      data-testid="route-playback-controls"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-fero-blue/25 bg-fero-blue/5 px-3 py-2"
        data-testid="route-playback-clock"
      >
        <p class="font-mono text-sm font-semibold tabular-nums text-fero-blue">{clockLabel()}</p>
      </div>

      <Show when={props.playback.isComplete()}>
        <div
          class="rounded-md border border-fero-green/40 bg-fero-green/10 px-3 py-2 text-sm font-semibold text-fero-green-dark"
          data-testid="route-playback-completion"
          role="status"
        >
          {completionSummary()}
        </div>
      </Show>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          icon={props.playback.isPlaying() ? <Pause size={16} /> : <Play size={16} />}
          onClick={() => props.playback.toggle()}
          aria-label={props.playback.isPlaying() ? 'Pausar recorrido' : 'Reproducir recorrido'}
        >
          {props.playback.isPlaying() ? 'Pausa' : 'Reproducir'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={<RotateCcw size={16} />}
          onClick={() => props.playback.reset()}
          aria-label="Reiniciar recorrido"
        >
          Reiniciar
        </Button>

        <div class="ml-auto flex items-center gap-1" role="group" aria-label="Velocidad de reproducción">
          <For each={ROUTE_PLAYBACK_SPEEDS}>
            {(speed) => (
              <button
                type="button"
                class={`rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-medium transition-colors ${
                  props.playback.speed() === speed
                    ? 'bg-fero-blue text-white'
                    : 'bg-app text-text-secondary hover:bg-surface-hover'
                }`}
                onClick={() => props.playback.setSpeed(speed as RoutePlaybackSpeed)}
                aria-pressed={props.playback.speed() === speed}
                data-testid={`route-playback-speed-${speed}x`}
              >
                {speed}x
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-text-secondary">
          <span>Línea de tiempo</span>
          <span>{progressPercent()}%</span>
        </div>
        <input
          type="range"
          class="route-playback-scrubber"
          min={0}
          max={100}
          step={0.5}
          value={progressPercent()}
          aria-label="Posición del recorrido"
          data-testid="route-playback-scrubber"
          onInput={(event) =>
            props.playback.setProgress(Number(event.currentTarget.value) / 100)
          }
        />
      </div>

      <Show when={!props.compact && props.routes.length > 1}>
        <div class="flex flex-wrap gap-2 text-xs text-text-muted">
          <For each={props.routes}>
            {(route) => {
              const state = () =>
                props.playback.routeStates().find((item) => item.routeId === route.routeId);
              return (
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-app px-2 py-0.5"
                  style={{ 'border-left': `3px solid ${route.color}` }}
                >
                  {route.vehicleLabel}
                  <span class="text-text-secondary">
                    · {state()?.completedStops ?? 0}/{route.stops.length}
                  </span>
                </span>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
