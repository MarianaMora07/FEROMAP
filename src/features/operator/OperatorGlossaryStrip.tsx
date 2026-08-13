import { For } from 'solid-js';
import { OPERATOR_GLOSSARY } from '../../core/operator/operatorUx';

export function OperatorGlossaryStrip() {
  return (
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="operator-glossary">
      <For each={OPERATOR_GLOSSARY}>
        {(term) => (
          <div class={`rounded-lg border px-3 py-2 text-xs ${term.toneClass}`}>
            <p class={`font-semibold ${term.titleClass}`}>{term.label}</p>
            <p class="mt-0.5 text-text-secondary">{term.definition}</p>
          </div>
        )}
      </For>
    </div>
  );
}
