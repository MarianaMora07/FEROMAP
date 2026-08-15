import { For, Show } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import type { DemoAcoPlaybackController } from '../../core/demo-aco/demoAcoStore';
import { demoConvergenceToChartPoints } from '../../core/demo-aco/demoConvergence';
import { AcoConvergenceChart } from '../simulation/AcoConvergenceChart';
import { ModuleGuidanceBanner } from '../shared/ModuleGuidanceBanner';
import { AcoBenchmarkPanel } from '../simulation/AcoBenchmarkPanel';

interface DemoConvergencePanelProps {
  playback: DemoAcoPlaybackController;
}

const VRP_COMPARISON_ROWS = [
  {
    aspect: 'Objetivo',
    maze: 'Camino más corto entre inicio y meta',
    vrp: 'Rutas de recolección con mínimo costo operativo',
  },
  {
    aspect: 'Grafo',
    maze: 'Grilla pequeña con paredes',
    vrp: 'Red vial OSMnx (Bucaramanga)',
  },
  {
    aspect: 'Restricciones',
    maze: 'No pasar por paredes',
    vrp: 'Capacidad, vertedero, jornada, tiempos de servicio',
  },
  {
    aspect: 'Métrica',
    maze: 'Pasos (aristas recorridas)',
    vrp: 'Kilómetros y duración operativa',
  },
  {
    aspect: 'ACO',
    maze: 'Mismo α, β, ρ y depósito de feromonas',
    vrp: 'Motor `_aco_cvrp` en el servidor',
  },
] as const;

export function DemoConvergencePanel(props: DemoConvergencePanelProps) {
  const chartPoints = () =>
    demoConvergenceToChartPoints(props.playback.runResult()?.convergence ?? []);

  const maze = () => props.playback.maze();

  return (
    <div class="space-y-5">
      <Card>
        <CardHeader
          title="Convergencia del ACO"
          subtitle="Costo vs iteración en el laberinto — el mismo patrón de mejora gradual que en producción."
        />

        <div class="space-y-4">
          <p class="text-sm text-text-secondary">
            En el laberinto buscamos el <strong class="font-semibold text-text-primary">camino más corto</strong>;
            en FEROMAP el ACO optimiza rutas con <strong class="font-semibold text-text-primary">capacidad</strong>,
            <strong class="font-semibold text-text-primary"> vertedero</strong> y{' '}
            <strong class="font-semibold text-text-primary">restricciones de turno</strong>. La curva inferior
            muestra cómo baja el costo mejor global mientras las hormigas exploran.
          </p>

          <ModuleGuidanceBanner
            tone="simulation"
            title="¿Quieres evaluar escenarios completos?"
            linkHref="/simulation"
            linkLabel="Ir a simulación de escenarios"
          >
            Mapa real, condiciones de tráfico y KPIs comparativos en
          </ModuleGuidanceBanner>

          <Show
            when={props.playback.hasRun()}
            fallback={
              <p class="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted dark:border-dark-border">
                Ejecuta la demo del laberinto para ver la curva de convergencia.
              </p>
            }
          >
            <div
              class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
              data-testid="demo-convergence-results"
            >
              <div class="space-y-2" data-testid="demo-convergence-chart">
                <AcoConvergenceChart
                  points={chartPoints()}
                  yAxisTitle="Costo (pasos)"
                  bestSeriesLabel="Mejor costo global"
                  iterationSeriesLabel="Mejor de la iteración"
                />
                <p class="text-xs text-text-muted">
                  Óptimo conocido del laberinto:{' '}
                  <span class="font-mono font-semibold text-text-primary">
                    {maze().knownOptimalCost}
                  </span>{' '}
                  pasos · Hormigas por iteración:{' '}
                  <span class="font-mono font-semibold text-text-primary">
                    {props.playback.antCount()}
                  </span>
                </p>
              </div>

              <div class="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
                <table class="w-full min-w-[320px] text-left text-sm">
                  <thead class="bg-surface/80 text-xs uppercase tracking-wide text-text-muted dark:bg-dark-surface-hover">
                    <tr>
                      <th class="px-3 py-2.5 font-semibold">Aspecto</th>
                      <th class="px-3 py-2.5 font-semibold">Laberinto</th>
                      <th class="px-3 py-2.5 font-semibold">FEROMAP (VRP)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border text-text-secondary dark:divide-dark-border">
                    <For each={VRP_COMPARISON_ROWS}>
                      {(row) => (
                        <tr>
                          <td class="px-3 py-2.5 font-medium text-text-primary">{row.aspect}</td>
                          <td class="px-3 py-2.5">{row.maze}</td>
                          <td class="px-3 py-2.5">{row.vrp}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
        </div>
      </Card>

      <div>
        <h3 class="mb-3 font-heading text-lg font-semibold text-text-primary">ACO en rutas reales</h3>
        <p class="mb-3 text-sm text-text-secondary">
          Benchmark del motor en escenarios de Bucaramanga: tiempo de CPU del servidor vs. calidad de la solución.
        </p>
        <AcoBenchmarkPanel />
      </div>
    </div>
  );
}
