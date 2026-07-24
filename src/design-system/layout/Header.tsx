import { Show } from 'solid-js';
import { Menu, Search, Bell } from 'lucide-solid';
import { toggleSidebar, appState } from '../../core/stores/appStore';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header(props: HeaderProps) {
  return (
    <header class="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-4 border-b border-border bg-surface/80 backdrop-blur-md px-4 md:px-6 dark:bg-dark-surface/80 dark:border-dark-border">
      <button
        type="button"
        onClick={toggleSidebar}
        class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        aria-label="Alternar menú"
      >
        <Menu size={20} />
      </button>

      <div class="flex-1 min-w-0">
        <Show when={props.title}>
          <h1 class="font-heading text-lg font-semibold text-text-primary dark:text-white truncate">
            {props.title}
          </h1>
        </Show>
        <Show when={props.subtitle}>
          <p class="text-xs text-text-muted truncate">{props.subtitle}</p>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          aria-label="Buscar"
        >
          <Search size={18} />
        </button>

        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          <span class="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-fero-green-mid" />
        </button>

        <div class="ml-2 flex items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-fero-blue/10 flex items-center justify-center">
            <span class="text-sm font-semibold text-fero-blue">VA</span>
          </div>
        </div>
      </div>
    </header>
  );
}
