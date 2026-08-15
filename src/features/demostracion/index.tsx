import { createSignal, onCleanup, Show } from 'solid-js';
import { createDemoAcoPlayback } from '../../core/demo-aco/demoAcoStore';
import { DemoConceptPanel } from './DemoConceptPanel';
import { DemoConvergencePanel } from './DemoConvergencePanel';
import { DemostracionShell } from './DemostracionShell';
import { DEMOSTRACION_DEFAULT_TAB, type DemostracionTabId } from './demostracionTabs';
import { MazeDemoPanel } from './MazeDemoPanel';

export default function DemostracionPage() {
  const playback = createDemoAcoPlayback();
  const [tab, setTab] = createSignal<DemostracionTabId>(DEMOSTRACION_DEFAULT_TAB);

  onCleanup(() => playback.dispose());

  return (
    <DemostracionShell tab={tab()} onTabChange={setTab}>
      <Show when={tab() === 'concepto'}>
        <DemoConceptPanel />
      </Show>
      <Show when={tab() === 'laberinto'}>
        <MazeDemoPanel playback={playback} />
      </Show>
      <Show when={tab() === 'convergencia'}>
        <DemoConvergencePanel playback={playback} />
      </Show>
    </DemostracionShell>
  );
}
