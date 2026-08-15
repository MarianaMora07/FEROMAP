import { Pause, Play } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';

interface OperatorMobilePlaybackControlsProps {
  playback: RoutePlaybackController;
  disabled?: boolean;
}

export function OperatorMobilePlaybackControls(props: OperatorMobilePlaybackControlsProps) {
  return (
    <div
      class="absolute bottom-3 right-3 z-10"
      data-testid="operator-mobile-playback-controls"
    >
      <Button
        type="button"
        size="lg"
        variant="primary"
        class="min-h-12 min-w-12 gap-2 rounded-full px-4 shadow-lg"
        disabled={props.disabled}
        icon={props.playback.isPlaying() ? <Pause size={18} /> : <Play size={18} />}
        onClick={() => props.playback.toggle()}
        aria-label={props.playback.isPlaying() ? 'Pausar recorrido' : 'Reproducir recorrido'}
      >
        {props.playback.isPlaying() ? 'Pausa' : 'Play'}
      </Button>
    </div>
  );
}
