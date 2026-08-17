import { createSignal, For } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { useLocation } from '@solidjs/router';
import { SidebarNavLink } from './SidebarNavLink';
import { isNavItemActive } from './navUtils';
import type { NavItemDef } from '../../../core/auth/permissions';
import type { LucideProps } from 'lucide-solid';

type IconComponent = (props: LucideProps) => import('solid-js').JSX.Element;

interface SidebarCollapsibleGroupProps {
  label: string;
  items: NavItemDef[];
  defaultOpen?: boolean;
  iconMap: Record<string, IconComponent>;
}

export function SidebarCollapsibleGroup(props: SidebarCollapsibleGroupProps) {
  const location = useLocation();
  const hasActiveChild = () =>
    props.items.some((item) => isNavItemActive(item.href, location.pathname));
  const [open, setOpen] = createSignal(props.defaultOpen ?? hasActiveChild());

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open())}
        class={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 hover:bg-sidebar-elevated
          ${hasActiveChild() ? 'text-nav-active-text' : 'text-nav-section'}`}
      >
        <span>{props.label}</span>
        <ChevronDown
          size={14}
          class={`transition-transform duration-300 ease-in-out ${open() ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        class="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
        style={{
          'max-height': open() ? `${props.items.length * 52}px` : '0px',
          opacity: open() ? '1' : '0',
        }}
      >
        <div class="ml-2 space-y-0.5 border-l border-sidebar-divider pl-1 pt-1">
          <For each={props.items}>
            {(item) => {
              const Icon = props.iconMap[item.href];
              return (
                <SidebarNavLink
                  href={item.href}
                  active={isNavItemActive(item.href, location.pathname)}
                  icon={Icon ? <Icon size={18} class="shrink-0" /> : null}
                  label={item.label}
                  description={item.description}
                />
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
