import { For, type JSX } from 'solid-js';
import { DEMOSTRACION_TABS, type DemostracionTabId } from './demostracionTabs';

interface DemostracionShellProps {
  tab: DemostracionTabId;
  onTabChange: (tab: DemostracionTabId) => void;
  children: JSX.Element;
}

export function DemostracionShell(props: DemostracionShellProps) {
  const activeTab = () => DEMOSTRACION_TABS.find((item) => item.id === props.tab);

  return (
    <div class="space-y-4" data-testid="demostracion-page">
      <div class="lg:grid lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
        <nav
          class="flex gap-1 overflow-x-auto border-b border-border pb-0 dark:border-dark-border lg:flex-col lg:gap-1 lg:border-b-0 lg:border-r lg:border-border lg:pr-3 lg:dark:border-dark-border"
          aria-label="Secciones de demostración"
        >
          <For each={DEMOSTRACION_TABS}>
            {(item) => (
              <button
                type="button"
                id={`demostracion-tab-${item.id}`}
                data-testid={`demostracion-tab-${item.id}`}
                class={`shrink-0 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors lg:w-full ${
                  props.tab === item.id
                    ? 'bg-fero-blue/10 text-fero-blue lg:border-l-2 lg:border-fero-blue lg:pl-2.5'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                }`}
                aria-current={props.tab === item.id ? 'page' : undefined}
                onClick={() => props.onTabChange(item.id)}
              >
                {item.label}
              </button>
            )}
          </For>
        </nav>

        <div class="min-w-0 space-y-3 pt-1 lg:pt-0">
          <p class="text-sm text-text-secondary">{activeTab()?.description}</p>
          <div
            role="tabpanel"
            id={`demostracion-panel-${props.tab}`}
            aria-labelledby={`demostracion-tab-${props.tab}`}
          >
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}
