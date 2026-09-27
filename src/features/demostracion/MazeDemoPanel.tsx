import { Show } from 'solid-js';
import { Route } from 'lucide-solid';
import { Card, CardHeader } from '../../design-system/components';
import type { DemoAcoPlaybackController } from '../../core/demo-aco/demoAcoStore';
import { DemoAntDecisionPanel } from './DemoAntDecisionPanel';
import { DemoLegend } from './DemoLegend';
import { DemoPlaybackControls } from './DemoPlaybackControls';
import { MazeDemoCanvas } from './MazeDemoCanvas';

interface MazeDemoPanelProps {
  playback: DemoAcoPlaybackController;
}

export function MazeDemoPanel(props: MazeDemoPanelProps) {
  const playback = () => props.playback;

  return (
    <Card>
      <CardHeader
        title="Laberinto interactivo"
        subtitle="Reproduce el ACO iteración a iteración: feromonas, hormigas y mejor ruta."
      />

      <div class="space-y-4">
        <DemoPlaybackControls playback={playback()} />

        <p class="text-sm text-text-secondary">{playback().maze().description}</p>

        <Show when={playback().currentSnapshot()} fallback={<MazeDemoEmptyState />}>
          {(snapshot) => (
            <div class="space-y-4">
              <MazeDemoCanvas
                maze={playback().maze()}
                snapshot={snapshot()}
                activeAntId={playback().activeAntId()}
                decision={playback().currentDecision()}
                showAntTrails={playback().viewFlags().showAntTrails}
                showPheromones={playback().viewFlags().showPheromones}
                showBestPath={playback().viewFlags().showBestPath}
              />
              <DemoAntDecisionPanel decision={playback().currentDecision()} />
              <DemoLegend />
            </div>
          )}
        </Show>
      </div>
    </Card>
  );
}

function MazeDemoEmptyState() {
  return (
    <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center dark:border-dark-border">
      <Route size={28} class="text-fero-blue" aria-hidden="true" />
      <p class="text-sm text-text-secondary">
        Pulsa «Iniciar demo» para ejecutar el ACO y reproducir cómo exploran las hormigas.
      </p>
    </div>
  );
}
