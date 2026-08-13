import { Show, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { sidebarNavLinkClass, navHrefPath } from './navUtils';

interface SidebarNavLinkProps {
  href: string;
  active: boolean;
  icon: JSX.Element;
  label: string;
  description?: string;
}

export function SidebarNavLink(props: SidebarNavLinkProps) {
  const active = () => props.active;

  return (
    <A
      href={props.href}
      class={sidebarNavLinkClass(active())}
      data-testid={`sidebar-nav-${navHrefPath(props.href).replace(/^\//, '').replace(/\//g, '-') || 'home'}`}
    >
      {props.icon}
      <Show
        when={props.description}
        fallback={<span class="truncate">{props.label}</span>}
      >
        <span class="min-w-0">
          <span class="block truncate">{props.label}</span>
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
