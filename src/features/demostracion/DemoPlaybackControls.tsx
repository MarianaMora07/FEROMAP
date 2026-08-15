import { For, Show } from 'solid-js';
import { ChevronLeft, ChevronRight, Pause, Play, Presentation, RotateCcw } from 'lucide-solid';
import { Button, SelectField } from '../../design-system/components';
import { DEMO_MAZE_PRESETS } from '../../core/demo-aco/mazes';
import type { MazePresetId } from '../../core/demo-aco/mazeTypes';
import {
  DEMO_ACO_PLAYBACK_SPEEDS,
  type DemoAcoPlaybackController,
  type DemoAcoPlaybackSpeed,
  type DemoAcoViewMode,
} from '../../core/demo-aco/demoAcoStore';

interface DemoPlaybackControlsProps {
  playback: DemoAcoPlaybackController;
  class?: string;
}

const VIEW_MODES: { id: DemoAcoViewMode; label: string }[] = [
  { id: 'all', label: 'Todas las hormigas' },
  { id: 'best', label: 'Solo mejor ruta' },
  { id: 'pheromones', label: 'Solo feromonas' },
];

export function DemoPlaybackControls(props: DemoPlaybackControlsProps) {
  const snapshot = () => props.playback.currentSnapshot();
  const scrubPercent = () => {
    const max = props.playback.maxFrameIndex();
    if (max <= 0) return 0;
    return Math.round((props.playback.frameIndex() / max) * 100);
  };

  return (
    <div
      class={`flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-sm dark:border-dark-border dark:bg-dark-surface ${props.class ?? ''}`}
      data-testid="demo-playback-controls"
    >
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-[200px] flex-1">
          <SelectField
            label="Laberinto"
            value={props.playback.presetId()}
            onChange={(event) =>
              props.playback.setPresetId(event.currentTarget.value as MazePresetId)
            }
          >
            <For each={DEMO_MAZE_PRESETS}>
              {(preset) => <option value={preset.id}>{preset.label}</option>}
            </For>
          </SelectField>
        </div>
        <Show
          when={props.playback.hasRun()}
          fallback={
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                icon={<Play size={16} />}
                onClick={() => props.playback.startDemo()}
                data-testid="demo-playback-start"
              >
                Iniciar demo
              </Button>
              <Button
                type="button"
                variant="outline"
                icon={<Presentation size={16} />}
                onClick={() => props.playback.startPresentationMode()}
                data-testid="demo-presentation-mode"
                aria-label="Modo presentación: 60 segundos con laberinto complejo"
              >
                Modo presentación (60 s)
              </Button>
            </div>
          }
        >
          <Button
            type="button"
            variant="outline"
            icon={<RotateCcw size={16} />}
            onClick={() => props.playback.resetDemo()}
            data-testid="demo-playback-reset"
          >
            Reiniciar
          </Button>
        </Show>
      </div>

      <Show when={props.playback.hasRun()}>
        <Show when={props.playback.isPresentationMode()}>
          <p
            class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200"
            role="status"
            data-testid="demo-presentation-active"
          >
            Modo presentación activo — reproducción automática 60 s (laberinto complejo, 0.5×).
          </p>
        </Show>
        <div
          class="rounded-md border border-fero-blue/25 bg-fero-blue/5 px-3 py-2 text-sm font-medium text-text-primary"
          data-testid="demo-playback-status"
          role="status"
        >
          {props.playback.statusLabel()}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={<ChevronLeft size={16} />}
            onClick={() => props.playback.stepFrameBackward()}
            aria-label="Frame anterior"
            data-testid="demo-frame-prev"
            disabled={props.playback.frameIndex() <= 0}
          >
            Anterior
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            icon={props.playback.isPlaying() ? <Pause size={16} /> : <Play size={16} />}
            onClick={() => props.playback.toggle()}
            aria-label={props.playback.isPlaying() ? 'Pausar demostración' : 'Reproducir demostración'}
            data-testid="demo-playback-toggle"
          >
            {props.playback.isPlaying() ? 'Pausa' : 'Reproducir'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={<ChevronRight size={16} />}
            onClick={() => props.playback.stepFrameForward()}
            aria-label="Frame siguiente"
            data-testid="demo-frame-next"
            disabled={props.playback.frameIndex() >= props.playback.maxFrameIndex()}
          >
            Siguiente
          </Button>

          <div class="ml-auto flex items-center gap-1" role="group" aria-label="Velocidad de reproducción">
            <For each={DEMO_ACO_PLAYBACK_SPEEDS}>
              {(speed) => (
                <button
                  type="button"
                  class={`rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-medium transition-colors ${
                    props.playback.speed() === speed
                      ? 'bg-fero-blue text-white'
                      : 'bg-app text-text-secondary hover:bg-surface-hover'
                  }`}
                  onClick={() => props.playback.setSpeed(speed as DemoAcoPlaybackSpeed)}
                  aria-pressed={props.playback.speed() === speed}
                  data-testid={`demo-playback-speed-${speed}x`}
                >
                  {speed}x
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs text-text-secondary">
            <span>Frames (pasos de hormigas)</span>
            <span>{scrubPercent()}%</span>
          </div>
          <input
            id="demo-playback-scrubber"
            type="range"
            class="route-playback-scrubber w-full accent-fero-blue"
            min={0}
            max={props.playback.maxFrameIndex()}
            step={1}
            value={props.playback.frameIndex()}
            aria-label="Posición del frame de reproducción"
            data-testid="demo-playback-scrubber"
            onInput={(event) =>
              props.playback.setFrameIndex(Number(event.currentTarget.value))
            }
          />
        </div>

        <div class="flex flex-wrap gap-2" role="group" aria-label="Modo de visualización">
          <For each={VIEW_MODES}>
            {(mode) => (
              <button
                type="button"
                class={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  props.playback.viewMode() === mode.id
                    ? 'bg-fero-blue/15 text-fero-blue'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                onClick={() => props.playback.setViewMode(mode.id)}
                aria-pressed={props.playback.viewMode() === mode.id}
                data-testid={`demo-view-mode-${mode.id}`}
              >
                {mode.label}
              </button>
            )}
          </For>
        </div>

        <Show when={snapshot()?.ants.length > 0 && props.playback.viewMode() !== 'pheromones'}>
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            aria-labelledby="demo-ant-follow-label"
          >
            <span id="demo-ant-follow-label" class="text-xs font-medium text-text-muted">
              Seguir hormiga:
            </span>
            <button
              type="button"
              class={`rounded-md px-2 py-1 text-xs ${
                props.playback.activeAntId() === null
                  ? 'bg-fero-blue/15 font-semibold text-fero-blue'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
              onClick={() => props.playback.setActiveAntId(null)}
              aria-label="Mostrar todas las hormigas"
            >
              Todas
            </button>
            <For each={snapshot()!.ants}>
              {(ant) => (
                <button
                  type="button"
                  class={`rounded-md px-2 py-1 text-xs ${
                    props.playback.activeAntId() === ant.id
                      ? 'bg-fero-blue/15 font-semibold text-fero-blue'
                      : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                  onClick={() => props.playback.setActiveAntId(ant.id)}
                  data-testid={`demo-ant-follow-${ant.id}`}
                  aria-label={`Seguir hormiga ${ant.id + 1}${ant.completed ? '' : ' (falló)'}`}
                >
                  #{ant.id + 1}
                  {ant.completed ? '' : ' (falló)'}
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
