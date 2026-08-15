import { For } from 'solid-js';
import {
  MAZE_ANT_TRAIL_COLORS,
  MAZE_CANVAS_THEME_LIGHT,
} from '../../core/demo-aco/mazeCanvasDraw';
import { PHEROMONE_COLOR_HIGH, PHEROMONE_COLOR_LOW } from '../../core/demo-aco/pheromoneColor';

interface LegendItem {
  label: string;
  description?: string;
  swatch?: string;
  gradient?: { from: string; to: string };
  line?: { color: string; dashed?: boolean; thick?: boolean };
  marker?: { fill: string; label?: string };
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    label: 'Celdas y paredes',
    description: 'Grilla del laberinto',
    swatch: MAZE_CANVAS_THEME_LIGHT.cellFill,
  },
  {
    label: 'Feromonas',
    description: 'Azul = baja · Ámbar = alta',
    gradient: {
      from: `rgb(${PHEROMONE_COLOR_LOW.r}, ${PHEROMONE_COLOR_LOW.g}, ${PHEROMONE_COLOR_LOW.b})`,
      to: `rgb(${PHEROMONE_COLOR_HIGH.r}, ${PHEROMONE_COLOR_HIGH.g}, ${PHEROMONE_COLOR_HIGH.b})`,
    },
  },
  {
    label: 'Rutas de hormigas',
    description: 'Línea y huellas por hormiga (colores distintos)',
    line: { color: MAZE_ANT_TRAIL_COLORS[0]!, dashed: true },
  },
  {
    label: 'Huellas del recorrido',
    description: 'Cada paso que exploró una hormiga',
    marker: { fill: MAZE_ANT_TRAIL_COLORS[4]! },
  },
  {
    label: 'Mejor ruta global',
    description: 'Camino verde destacado de la iteración',
    line: { color: MAZE_CANVAS_THEME_LIGHT.bestPathStroke, thick: true },
  },
  {
    label: 'Hormigas',
    description: 'Posición actual de cada exploradora',
    marker: { fill: MAZE_ANT_TRAIL_COLORS[2]! },
  },
  {
    label: 'Inicio (S)',
    marker: { fill: MAZE_CANVAS_THEME_LIGHT.startFill, label: 'S' },
  },
  {
    label: 'Meta (M)',
    marker: { fill: MAZE_CANVAS_THEME_LIGHT.endFill, label: 'M' },
  },
];

export function DemoLegend() {
  return (
    <div
      class="rounded-lg border border-border bg-surface/60 p-3 dark:border-dark-border dark:bg-dark-surface/40"
      aria-label="Leyenda del laberinto"
    >
      <p id="demo-legend-title" class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Leyenda
      </p>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="demo-legend-title">
        <For each={LEGEND_ITEMS}>
          {(item) => (
            <li class="flex items-start gap-2 text-xs text-text-secondary">
              <div class="mt-0.5 flex h-5 w-8 shrink-0 items-center justify-center">
                {item.swatch ? (
                  <span
                    class="h-4 w-full rounded border border-border dark:border-dark-border"
                    style={{ background: item.swatch }}
                    aria-hidden="true"
                  />
                ) : null}
                {item.gradient ? (
                  <span
                    class="h-4 w-full rounded"
                    style={{
                      background: `linear-gradient(90deg, ${item.gradient.from}, ${item.gradient.to})`,
                    }}
                    aria-hidden="true"
                  />
                ) : null}
                {item.line ? (
                  <span
                    class="h-0 w-full border-t-2"
                    style={{
                      borderColor: item.line.color,
                      borderTopWidth: item.line.thick ? 3 : 2,
                      borderStyle: item.line.dashed ? 'dashed' : 'solid',
                    }}
                    aria-hidden="true"
                  />
                ) : null}
                {item.marker ? (
                  <span
                    class="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-slate-900"
                    style={{ background: item.marker.fill }}
                    aria-hidden="true"
                  >
                    {item.marker.label ?? ''}
                  </span>
                ) : null}
              </div>
              <div>
                <p class="font-medium text-text-primary">{item.label}</p>
                {item.description ? <p class="text-[11px] text-text-muted">{item.description}</p> : null}
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
