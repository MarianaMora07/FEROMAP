import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight } from 'lucide-solid';

export interface ResidentBreadcrumbItem {
  label: string;
  href?: string;
}

export function ResidentBreadcrumbs(props: { items: ResidentBreadcrumbItem[] }) {
  return (
    <nav aria-label="Navegación Mi Recolección" class="flex flex-wrap items-center gap-1.5 text-xs">
      <For each={props.items}>
        {(item, index) => (
          <>
            <Show when={index() > 0}>
              <ChevronRight size={12} class="shrink-0 text-text-muted" aria-hidden="true" />
            </Show>
            <Show
              when={item.href}
              fallback={<span class="font-medium text-text-secondary">{item.label}</span>}
            >
              {(href) => (
                <A href={href()} class="font-medium text-fero-blue hover:underline">
                  {item.label}
                </A>
              )}
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}
