import { Show, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { sidebarNavLinkClass, navHrefPath } from './navUtils';

interface SidebarNavLinkProps {
  href: string;
  active: boolean;
  icon: JSX.Element;
  label: string;
  description?: string;
  /** Chip solo para módulos de demostración (tesis). El resto no lleva badge. */
  kind?: 'demo';
}

export function SidebarNavLink(props: SidebarNavLinkProps) {
  const active = () => props.active;

  const kindChip = () => {
    if (props.kind !== 'demo') return null;
    return (
      <span
        data-testid="sidebar-kind-demo"
        class="shrink-0 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
      >
        demo
      </span>
    );
  };

  return (
    <A
      href={props.href}
      class={sidebarNavLinkClass(active())}
      aria-current={active() ? 'page' : undefined}
      data-testid={`sidebar-nav-${navHrefPath(props.href).replace(/^\//, '').replace(/\//g, '-') || 'home'}`}
    >
      {props.icon}
      <Show
        when={props.description}
        fallback={
          <span class="flex min-w-0 flex-1 items-center justify-between gap-1">
            <span class="truncate">{props.label}</span>
            {kindChip()}
          </span>
        }
      >
        <span class="min-w-0 flex-1">
          <span class="flex items-center justify-between gap-1">
            <span class="truncate">{props.label}</span>
            {kindChip()}
          </span>
          <span
            class={`block truncate text-[10px] font-normal leading-tight ${
              active()
                ? 'text-nav-active-text/90'
                : 'text-nav-muted group-hover:text-white/80 dark:group-hover:text-nav'
            }`}
          >
            {props.description}
          </span>
        </span>
      </Show>
    </A>
  );
}
