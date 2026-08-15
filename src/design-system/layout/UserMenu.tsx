import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { ChevronDown, LogOut, Moon, Settings, Sun, User } from 'lucide-solid';
import { appState, toggleDarkMode } from '../../core/stores/appStore';
import {
  authUser,
  logout,
  userDisplayName,
  userInitials,
  userRoleLabel,
} from '../../core/stores/authStore';
import { BOTTOM_NAV_ITEMS } from '../../core/auth/permissions';

const menuItemClass =
  'flex w-full items-center gap-2.5 bg-transparent px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover';

export function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const bottomItems = createMemo(() => {
    const role = authUser()?.role;
    if (!role) return [];
    const order = ['/profile', '/admin'];
    return BOTTOM_NAV_ITEMS.filter((item) => item.roles.includes(role)).sort(
      (a, b) => order.indexOf(a.href) - order.indexOf(b.href),
    );
  });

  createEffect(() => {
    if (!open()) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef && target && !rootRef.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const iconForHref = (href: string) => {
    if (href === '/admin') return Settings;
    return User;
  };

  return (
    <div ref={rootRef} class="relative">
      <button
        type="button"
        class="flex max-w-56 items-center gap-2.5 rounded-md border border-default bg-elevated px-2 py-1.5 text-left text-text-primary transition-colors hover:bg-surface-hover sm:max-w-64"
        aria-label="Menú de cuenta"
        aria-haspopup="menu"
        aria-expanded={open()}
        data-testid="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fero-green-mid text-[11px] font-bold text-white">
          {userInitials()}
        </div>
        <div class="hidden min-w-0 flex-1 sm:block">
          <p class="truncate text-sm font-semibold text-text-primary">{userDisplayName()}</p>
          <p class="truncate text-[11px] text-text-muted">{userRoleLabel()}</p>
        </div>
        <ChevronDown
          size={16}
          class={`shrink-0 text-text-muted transition-transform ${open() ? 'rotate-180' : ''}`}
        />
      </button>

      <Show when={open()}>
        <div
          role="menu"
          aria-label="Opciones de cuenta"
          data-testid="user-menu-panel"
          class="absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-md border border-default bg-elevated py-1 shadow-lg"
        >
          <div class="border-b border-default px-3 py-2.5 sm:hidden">
            <p class="truncate text-sm font-semibold text-text-primary">{userDisplayName()}</p>
            <p class="truncate text-xs text-text-muted">{userRoleLabel()}</p>
          </div>

          <For each={bottomItems()}>
            {(item) => {
              const Icon = iconForHref(item.href);
              return (
                <A
                  href={item.href}
                  role="menuitem"
                  class={menuItemClass}
                  data-testid={`user-menu-nav-${item.href.replace(/^\//, '')}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={16} class="shrink-0" />
                  {item.label}
                </A>
              );
            }}
          </For>

          <button
            type="button"
            role="menuitem"
            class={menuItemClass}
            aria-label={appState.darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
            data-testid="user-menu-theme-toggle"
            onClick={() => void toggleDarkMode()}
          >
            {appState.darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {appState.darkMode ? 'Modo claro' : 'Modo oscuro'}
          </button>

          <div class="my-1 border-t border-default" />

          <button
            type="button"
            role="menuitem"
            class={`${menuItemClass} text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300`}
            data-testid="user-menu-logout"
            onClick={() => void handleLogout()}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </Show>
    </div>
  );
}
