import type { PlaybackCameraMode } from '../../core/route-playback/playbackCameraUx';

interface PlaybackCameraControlsProps {
  mode: PlaybackCameraMode;
  onModeChange: (mode: PlaybackCameraMode) => void;
  disabled?: boolean;
}

const MODES: { id: PlaybackCameraMode; label: string }[] = [
  { id: 'free', label: 'Libre' },
  { id: 'follow', label: 'Seguir camión' },
  { id: 'fit-all', label: 'Ver todas' },
];

export function PlaybackCameraControls(props: PlaybackCameraControlsProps) {
  return (
    <div class="space-y-1.5" role="group" aria-label="Modo de cámara">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Cámara</p>
      <div class="flex flex-wrap gap-1.5">
        {MODES.map((mode) => (
          <button
            type="button"
            class={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              props.mode === mode.id
                ? 'bg-fero-blue text-white'
                : 'border border-default bg-app text-text-secondary hover:bg-surface-hover'
            }`}
            disabled={props.disabled}
            aria-pressed={props.mode === mode.id}
            data-testid={`playback-camera-${mode.id}`}
            onClick={() => props.onModeChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
