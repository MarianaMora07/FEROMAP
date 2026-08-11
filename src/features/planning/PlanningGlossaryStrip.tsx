import { For } from 'solid-js';
import { PLANNING_LEVELS, type PlanningLevel } from '../../core/planning/planningUx';

const ORDER: PlanningLevel[] = ['directivo', 'administrativo', 'operativo'];

export function PlanningGlossaryStrip() {
  return (
    <div class="grid gap-2 md:grid-cols-3">
      <For each={ORDER}>
        {(level) => {
          const meta = PLANNING_LEVELS[level];
          return (
            <div
              class={`rounded-lg border px-3 py-2 text-xs ${meta.toneClass}`}
            >
              <p class={`font-semibold ${meta.titleClass}`}>{meta.shortLabel}</p>
              <p class="mt-0.5 text-text-secondary">{meta.glossary}</p>
            </div>
          );
        }}
      </For>
    </div>
  );
}
