import { ChevronDown } from 'lucide-solid';
import { A } from '@solidjs/router';
import { userDisplayName, userInitials, userRoleLabel } from '../../../core/stores/authStore';
import { sidebarInteractiveRowClass } from './navUtils';

export function SidebarUserRow() {
  return (
    <A href="/profile" class={sidebarInteractiveRowClass}>
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-fero-green-mid text-xs font-bold text-white">
        {userInitials()}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-white dark:text-nav">{userDisplayName()}</p>
        <p class="truncate text-xs text-nav-muted">{userRoleLabel()}</p>
      </div>
      <ChevronDown size={16} class="shrink-0 text-nav-muted" />
    </A>
  );
}
