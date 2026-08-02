import { type JSX, Show } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { ToastContainer } from '../components/Toast';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { appState } from '../../core/stores/appStore';
import { globalToast } from '../../core/stores/toastStore';

interface AppShellProps {
  children: JSX.Element;
  title?: string;
  subtitle?: string;
  fullWidth?: boolean;
}

export function AppShell(props: AppShellProps) {
  const location = useLocation();
  const isMapView = () => props.fullWidth || location.pathname === '/map';

  return (
    <div class="flex h-full overflow-hidden bg-surface dark:bg-dark-surface">
      <Sidebar open={appState.sidebarOpen} />

      <div
        class={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${
          appState.sidebarOpen ? 'ml-[var(--sidebar-width)]' : 'ml-0'
        }`}
      >
        <Show when={!isMapView()}>
          <Header title={props.title} subtitle={props.subtitle} />
        </Show>

        <main
          class={`min-h-0 flex-1 ${
            isMapView()
              ? 'overflow-hidden p-0'
              : 'overflow-auto bg-slate-50 p-4 md:p-6 dark:bg-dark-surface'
          }`}
        >
          {props.children}
        </main>
      </div>

      <ToastContainer toasts={globalToast.toasts()} onDismiss={globalToast.removeToast} />
    </div>
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
        <h1 class="font-heading text-[28px] font-bold text-text-primary dark:text-white">
          {props.title}
        </h1>
        {props.subtitle && <p class="mt-1 text-sm text-text-muted">{props.subtitle}</p>}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
