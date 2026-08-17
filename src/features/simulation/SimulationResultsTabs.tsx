import { For } from 'solid-js';
import { simulationResultsTabs, type SimulationResultsTabId } from './simulationResultsConfig';

interface SimulationResultsTabsProps {
  tab: SimulationResultsTabId;
  onTabChange: (tab: SimulationResultsTabId) => void;
}

export function SimulationResultsTabs(props: SimulationResultsTabsProps) {
  return (
    <div
      class="flex gap-1 overflow-x-auto border-b border-border dark:border-dark-border"
      data-testid="simulation-results-tabs"
      role="tablist"
      aria-label="Vista de resultados"
    >
      <For each={[...simulationResultsTabs]}>
        {(item) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === item.id}
            data-testid={`simulation-results-tab-${item.id}`}
            class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              props.tab === item.id
                ? 'border-fero-green-mid text-fero-green-dark'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => props.onTabChange(item.id)}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}
