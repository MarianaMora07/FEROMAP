import { type JSX } from 'solid-js';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { appState } from '../../core/stores/appStore';

interface AppShellProps {
  children: JSX.Element;
  title?: string;
  subtitle?: string;
  fullWidth?: boolean;
}

export function AppShell(props: AppShellProps) {
  return (
    <div class="flex h-full overflow-hidden bg-surface dark:bg-dark-surface">
      <Sidebar open={appState.sidebarOpen} />

      <div
        class={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${
          appState.sidebarOpen ? 'ml-[var(--sidebar-width)]' : 'ml-0'
        }`}
      >
        <Header title={props.title} subtitle={props.subtitle} />

        <main class={`min-h-0 flex-1 overflow-auto ${props.fullWidth ? '' : 'p-4 md:p-6'}`}>
          {props.children}
        </main>
      </div>
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
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="font-heading text-[28px] font-bold text-text-primary dark:text-white">
          {props.title}
        </h1>
        {props.subtitle && (
          <p class="text-sm text-text-muted mt-1">{props.subtitle}</p>
        )}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
