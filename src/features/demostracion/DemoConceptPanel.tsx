import { For, Show } from 'solid-js';
import {
  Footprints,
  ArrowRight,
  Beaker,
  Droplets,
  GitBranch,
  Map,
  Route,
} from 'lucide-solid';
import { Card, CardHeader } from '../../design-system/components';
import {
  DEMO_ACO_ALPHA,
  DEMO_ACO_BETA,
  DEMO_ACO_DEPOSIT_Q,
  DEMO_ACO_PARAM_TABLE,
  DEMO_ACO_PHEROMONE_RULES,
  DEMO_ACO_RHO,
  DEMO_ACO_SELECTION_FORMULA,
  DEMO_ACO_UI_PRESETS,
} from '../../core/demo-aco/demoAcoParams';
import { ModuleGuidanceBanner } from '../shared/ModuleGuidanceBanner';

interface ConceptSection {
  id: string;
  title: string;
  icon: typeof Route;
  summary: string;
  bullets: string[];
  highlight?: string;
}

const CONCEPT_SECTIONS: ConceptSection[] = [
  {
    id: 'problema',
    title: 'El problema',
    icon: Map,
    summary:
      'FEROMAP resuelve rutas de recolección de residuos (CVRP): varios camiones, capacidad, vertedero y jornada laboral. La demostración usa un laberinto como pathfinding simplificado para ver el mismo principio sin el mapa urbano.',
    bullets: [
      'Producción: grafo de calles OSMnx → matriz de distancias/tiempos → ACO sobre nodos reales.',
      'Demostración: grilla pequeña con inicio y meta — solo el camino más corto, sin capacidad ni vertedero.',
      'Ambos comparten la misma lógica: explorar rutas, dejar feromonas en las buenas y converger.',
    ],
    highlight:
      'CVRP = muchas restricciones operativas · Laberinto = una restricción (no pasar por paredes).',
  },
  {
    id: 'hormiga',
    title: 'La hormiga',
    icon: Footprints,
    summary:
      'Cada hormiga construye una ruta paso a paso. En cada nodo elige el siguiente candidato con probabilidad proporcional a feromona y cercanía.',
    bullets: [
      `Fórmula de elección: ${DEMO_ACO_SELECTION_FORMULA}`,
      `Con α = ${DEMO_ACO_ALPHA} la feromona influye linealmente; con β = ${DEMO_ACO_BETA} la cercanía pesa más que el rastro.`,
      'En producción cada hormiga respeta además capacidad del camión, visitas al vertedero y presupuesto de turno.',
      'Implementación: `aco_parallel.py` → función `_pick_candidate` (ruleta sobre candidatos legales).',
    ],
  },
  {
    id: 'feromonas',
    title: 'Las feromonas',
    icon: Droplets,
    summary:
      'Las feromonas son memoria del algoritmo: aristas con más rastro se vuelven más atractivas, pero evaporan para no quedar atrapado en rutas mediocres.',
    bullets: [
      `Evaporación global: ${DEMO_ACO_PHEROMONE_RULES.evaporation} (ρ = ${DEMO_ACO_RHO}).`,
      `Depósito en la mejor ruta de la iteración: ${DEMO_ACO_PHEROMONE_RULES.deposit} (Q = ${DEMO_ACO_DEPOSIT_Q}).`,
      'Inicialización en producción: τ = 1/distancia entre nodos.',
      'En el laberinto verás el mapa de feromonas intensificarse en el atajo correcto.',
    ],
  },
  {
    id: 'iteracion',
    title: 'La iteración',
    icon: GitBranch,
    summary:
      'Un ciclo completo: lanzar N hormigas, elegir la mejor ruta de esa tanda, actualizar feromonas y repetir hasta converger o alcanzar el máximo de iteraciones.',
    bullets: [
      '1. N hormigas construyen rutas en paralelo (workers en producción).',
      '2. Se guarda la mejor ruta y costo de la iteración.',
      '3. Evaporación + depósito sobre la matriz de feromonas.',
      '4. Si no mejora en varias iteraciones (paciencia), el algoritmo puede detenerse antes.',
      '5. Tras el ACO, producción aplica refinamiento 2-opt sobre la mejor solución.',
    ],
  },
];

function FlowDiagram() {
  return (
    <div
      class="rounded-xl border border-border bg-surface/50 p-4 dark:border-dark-border dark:bg-dark-surface/30"
      aria-label="Flujo del algoritmo ACO"
    >
      <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Flujo en menos de un minuto
      </p>
      <ol class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <For each={['Inicio + meta', 'N hormigas', 'Mejor ruta', 'τ evaporar + depositar', '¿Convergió?']}>
          {(step, index) => (
            <li class="flex items-center gap-2 text-sm text-text-secondary">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fero-blue/15 text-xs font-bold text-fero-blue"
              >
                {index() + 1}
              </span>
              <span class="font-medium text-text-primary">{step}</span>
              <Show when={index() < 4}>
                <ArrowRight size={14} class="hidden shrink-0 text-text-muted sm:block" aria-hidden="true" />
              </Show>
            </li>
          )}
        </For>
      </ol>
      <p class="mt-3 text-xs text-text-muted">
        Si no convergió, vuelve al paso 2. En FEROMAP el ciclo corre sobre la red vial real de Bucaramanga.
      </p>
    </div>
  );
}

function ParamsTable() {
  return (
    <div class="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="border-b border-border bg-surface/80 text-xs uppercase tracking-wide text-text-muted dark:border-dark-border dark:bg-dark-surface-hover">
          <tr>
            <th class="px-3 py-2.5 font-semibold">Símbolo</th>
            <th class="px-3 py-2.5 font-semibold">Parámetro</th>
            <th class="px-3 py-2.5 font-semibold">Valor en FEROMAP</th>
            <th class="px-3 py-2.5 font-semibold">Función</th>
            <th class="px-3 py-2.5 font-semibold">Código</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border dark:divide-dark-border">
          <For each={DEMO_ACO_PARAM_TABLE}>
            {(row) => (
              <tr class="text-text-secondary">
                <td class="px-3 py-2.5 font-mono text-text-primary">{row.symbol}</td>
                <td class="px-3 py-2.5 font-medium text-text-primary">{row.name}</td>
                <td class="px-3 py-2.5">{row.value}</td>
                <td class="px-3 py-2.5">{row.role}</td>
                <td class="px-3 py-2.5 font-mono text-[11px] text-text-muted">{row.source}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export function DemoConceptPanel() {
  return (
    <div class="space-y-5">
      <ModuleGuidanceBanner
        tone="simulation"
        title="Demostración didáctica — no es simulación de tesis"
        linkHref="/simulation"
        linkLabel="Ir a simulación de escenarios"
      >
        Aquí explicamos cómo funciona el ACO con un laberinto. Para evaluar escenarios completos con mapa
        real y KPIs comparativos, usa
      </ModuleGuidanceBanner>

      <Card>
        <div class="flex flex-wrap items-start gap-4">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fero-blue/10 text-fero-blue"
            aria-hidden="true"
          >
            <Beaker size={24} />
          </div>
          <div class="min-w-0 flex-1 space-y-2">
            <h2 class="font-heading text-xl font-bold text-text-primary">
              Cómo funciona el algoritmo ACO en FEROMAP
            </h2>
            <p class="text-sm text-text-secondary">
              Aquí verás cómo el ACO explora y converge: el{' '}
              <strong class="font-semibold text-text-primary">ACO (Ant Colony Optimization)</strong> imita
              colonias de hormigas — muchos intentos aleatorios, rastro en caminos buenos y olvido gradual.
              En este proyecto optimiza rutas de recolección; el laberinto interactivo (próxima fase) mostrará
              el mismo mecanismo en una grilla.
            </p>
          </div>
        </div>
      </Card>

      <FlowDiagram />

      <For each={CONCEPT_SECTIONS}>
        {(section) => {
          const Icon = section.icon;
          return (
            <Card>
              <div class="flex items-start gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fero-blue/10 text-fero-blue"
                  aria-hidden="true"
                >
                  <Icon size={20} />
                </div>
                <div class="min-w-0 flex-1 space-y-3">
                  <h3 class="font-heading text-lg font-semibold text-text-primary">{section.title}</h3>
                  <p class="text-sm text-text-secondary">{section.summary}</p>
                  <ul class="space-y-1.5 text-sm text-text-secondary">
                    <For each={section.bullets}>
                      {(bullet) => (
                        <li class="flex gap-2">
                          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fero-blue" aria-hidden="true" />
                          <span>{bullet}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={section.highlight}>
                    <p class="rounded-lg border border-fero-blue/20 bg-fero-blue/5 px-3 py-2 text-sm text-text-primary">
                      {section.highlight}
                    </p>
                  </Show>
                </div>
              </div>
            </Card>
          );
        }}
      </For>

      <Card>
        <CardHeader
          title="Parámetros del proyecto"
          subtitle="Valores reales del motor en servidor — mismos que verás en Simulación al elegir perfil ACO."
        />
        <ParamsTable />
        <div class="mt-4 flex flex-wrap gap-2">
          <For each={DEMO_ACO_UI_PRESETS}>
            {(preset) => (
              <span
                class="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover"
              >
                <span class="font-semibold text-text-primary">{preset.label}:</span> {preset.ants} hormigas ×{' '}
                {preset.iterations} iteraciones
              </span>
            )}
          </For>
        </div>
        <p class="mt-4 text-xs text-text-muted">
          Referencias:{' '}
          <code class="rounded bg-surface px-1 py-0.5 dark:bg-dark-surface-hover">
            backend/app/services/optimization_service.py
          </code>
          ,{' '}
          <code class="rounded bg-surface px-1 py-0.5 dark:bg-dark-surface-hover">
            backend/app/services/aco_parallel.py
          </code>
          ,{' '}
          <code class="rounded bg-surface px-1 py-0.5 dark:bg-dark-surface-hover">backend/app/config.py</code>
        </p>
      </Card>

    </div>
  );
}
