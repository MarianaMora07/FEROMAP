import { type JSX, Show, createEffect, createMemo, For } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { ToastContainer } from '../components/Toast';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { HeaderChromeProvider } from './pageChromeSlots';
import {
  appState,
  closeSidebarIfMobile,
  setSidebarOpen,
} from '../../core/stores/appStore';
import { globalToast } from '../../core/stores/toastStore';
import { useLocale } from '../../core/i18n/solid';
import {
  CONDUCTOR_BOTTOM_NAV_ITEMS,
  RESIDENT_BOTTOM_NAV_ITEMS,
  isConductor,
  isResident,
} from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { isNavItemActive } from './sidebar/navUtils';

interface AppShellProps {
  children: JSX.Element;
  title?: string;
  subtitle?: string;
  fullWidth?: boolean;
}

export function AppShell(props: AppShellProps) {
  const location = useLocation();
  const tr = useLocale();
  const isMapView = () => props.fullWidth || location.pathname === '/map';
  const isOptimization = () => location.pathname === '/optimization';
  const bottomNavItems = createMemo(() => {
    if (isMapView()) return [];
    const role = authUser()?.role;
    if (isConductor(role)) return CONDUCTOR_BOTTOM_NAV_ITEMS;
    if (isResident(role)) return RESIDENT_BOTTOM_NAV_ITEMS;
    return [];
  });

  createEffect(() => {
    location.pathname;
    closeSidebarIfMobile();
  });

  return (
    <HeaderChromeProvider>
    <div class="flex h-full overflow-hidden bg-app">
      <a
        href="#main-content"
        class="absolute left-2 top-2 z-50 -translate-y-16 rounded-md border border-default bg-elevated px-3 py-2 text-sm font-medium text-text-primary shadow transition-transform focus:translate-y-0"
      >
        {tr('shell.skipToContent')}
      </a>
      <Sidebar open={appState.sidebarOpen} />

      <Show when={appState.sidebarOpen}>
        <button
          type="button"
          class="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
        />
      </Show>

      <div
        class={`flex min-w-0 flex-1 flex-col bg-app transition-[margin] duration-300 ${
          appState.sidebarOpen ? 'ml-0 lg:ml-[var(--sidebar-width)]' : 'ml-0'
        }`}
      >
        <Show when={!isMapView()}>
          <Header title={props.title} subtitle={props.subtitle} />
        </Show>

        <main
          id="main-content"
          class={`min-h-0 flex-1 ${
            isMapView()
              ? 'overflow-hidden p-0'
              : isOptimization()
                ? 'overflow-auto bg-app px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-3'
                : `overflow-auto bg-app p-4 md:p-6 ${bottomNavItems().length > 0 ? 'pb-24 lg:pb-6' : ''}`
          }`}
        >
          {props.children}
        </main>
      </div>

      <Show when={bottomNavItems().length > 0}>
        <nav
          class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
          data-testid="role-bottom-nav"
          aria-label="Navegación rápida"
        >
          <ul class="mx-auto flex max-w-lg items-stretch justify-between">
            <For each={bottomNavItems()}>
              {(item) => {
                const active = () => isNavItemActive(item.href, location.pathname);
                return (
                  <li class="flex-1">
                    <A
                      href={item.href}
                      class={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors ${
                        active() ? 'text-fero-blue' : 'text-text-muted'
                      }`}
                      data-testid={`bottom-nav-${item.href.replace(/^\//, '').replace(/[/?=&]/g, '-')}`}
                    >
                      <span
                        class={`absolute inset-x-3 top-0 h-0.5 rounded-full bg-fero-blue transition-transform duration-200 ${
                          active() ? 'scale-x-100' : 'scale-x-0'
                        }`}
                        aria-hidden="true"
                      />
                      <span
                        class={`rounded-full px-2.5 py-0.5 transition-all duration-200 ${
                          active() ? 'bg-fero-blue/10 font-semibold' : ''
                        }`}
                      >
                        {item.label}
                      </span>
                    </A>
                  </li>
                );
              }}
            </For>
          </ul>
        </nav>
      </Show>

      <ToastContainer toasts={globalToast.toasts()} onDismiss={globalToast.removeToast} />
    </div>
    </HeaderChromeProvider>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: JSX.Element;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="font-heading text-[28px] font-bold text-text-primary">
          {props.title}
        </h1>
        {props.subtitle && <p class="mt-1 text-sm text-text-muted">{props.subtitle}</p>}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
