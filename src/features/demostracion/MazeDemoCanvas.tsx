import { createEffect, onCleanup, onMount } from 'solid-js';
import type { MazeDefinition } from '../../core/demo-aco/mazeTypes';
import type { DemoAcoSnapshot } from '../../core/demo-aco/demoAcoEngine';
import type { DemoAcoAntDecision } from '../../core/demo-aco/demoAcoFrames';
import {
  computeMazeCanvasLayout,
  drawMazeCanvas,
  MAZE_CANVAS_THEME_DARK,
  MAZE_CANVAS_THEME_LIGHT,
} from '../../core/demo-aco/mazeCanvasDraw';
import { appState } from '../../core/stores/appStore';

export interface MazeDemoCanvasProps {
  maze: MazeDefinition;
  snapshot: DemoAcoSnapshot;
  activeAntId?: number | null;
  showAntTrails?: boolean;
  showPheromones?: boolean;
  showBestPath?: boolean;
  decision?: DemoAcoAntDecision | null;
  class?: string;
}

export function MazeDemoCanvas(props: MazeDemoCanvasProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  const showAntTrails = () => props.showAntTrails ?? true;
  const showPheromones = () => props.showPheromones ?? true;
  const showBestPath = () => props.showBestPath ?? true;
  const theme = () =>
    appState.darkMode ? MAZE_CANVAS_THEME_DARK : MAZE_CANVAS_THEME_LIGHT;

  const paint = () => {
    const canvas = canvasRef;
    const container = containerRef;
    if (!canvas || !container) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layout = computeMazeCanvasLayout(props.maze, width, height);

    drawMazeCanvas(ctx, layout, {
      maze: props.maze,
      pheromone: props.snapshot.pheromone,
      bestPath: props.snapshot.bestPath,
      antPaths: props.snapshot.ants.map((ant) => ({
        id: ant.id,
        path: ant.path,
        completed: ant.completed,
      })),
      activeAntId: props.activeAntId,
      showAntTrails: showAntTrails(),
      showPheromones: showPheromones(),
      showBestPath: showBestPath(),
      decision: props.decision,
      theme: theme(),
    });
  };

  onMount(() => {
    if (!containerRef) return;

    const observer = new ResizeObserver(() => paint());
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
    paint();
  });

  createEffect(() => {
    props.maze;
    props.snapshot;
    props.activeAntId;
    showAntTrails();
    showPheromones();
    showBestPath();
    props.decision;
    theme();
    paint();
  });

  return (
    <div
      ref={containerRef}
      class={`relative min-h-[min(52vh,420px)] w-full overflow-hidden rounded-lg border border-border bg-elevated dark:border-dark-border dark:bg-dark-surface ${props.class ?? ''}`}
    >
      <canvas
        ref={canvasRef}
        class="block h-full min-h-[min(52vh,420px)] w-full"
        aria-label="Visualización del laberinto ACO"
      />
    </div>
  );
}
