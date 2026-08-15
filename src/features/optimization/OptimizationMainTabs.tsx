import { For } from 'solid-js';
import { optimizationTabs, type OptimizationTabId } from '../../data/mock/optimization';

interface OptimizationMainTabsProps {
  tab: OptimizationTabId;
  onTabChange: (tab: OptimizationTabId) => void;
}

export function OptimizationMainTabs(props: OptimizationMainTabsProps) {
  return (
    <div
      class="flex gap-1 overflow-x-auto border-b border-default"
      data-testid="optimization-main-tabs"
      role="tablist"
      aria-label="Vista de optimización"
    >
      <For each={[...optimizationTabs]}>
        {(item) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === item.id}
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
