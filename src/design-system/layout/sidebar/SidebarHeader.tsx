import { useLocale } from '../../../core/i18n/solid';

export function SidebarHeader() {
  const tr = useLocale();
  return (
    <div class="flex h-(--header-height) shrink-0 items-center gap-3 border-b border-sidebar-divider px-4 dark:border-default">
      <img src="/feromap-logo.png" alt="FEROMAP" class="h-10 w-10 shrink-0 object-contain" />
      <div class="min-w-0">
        <p class="font-heading truncate text-lg font-extrabold leading-none tracking-tight">
          <span class="text-white">FERO</span>
          <span class="text-fero-green">MAP</span>
        </p>
        <p class="mt-0.5 truncate text-[10px] leading-tight text-nav-muted">
          {tr('ui.tagline')}
        </p>
      </div>
    </div>
  );
}
