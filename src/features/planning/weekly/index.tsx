import { A } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import { AppShellSubheader } from '../../../design-system/layout/pageChromeSlots';
import { WeeklyPlanTab } from './WeeklyPlanTab';

export default function PlanningWeeklyPage() {
  return (
    <div class="space-y-4" data-testid="planning-weekly-page">
      <AppShellSubheader>
        <A
          href="/planning/weeks"
          class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
          data-testid="weekly-plan-back-to-list"
        >
          <ArrowLeft size={14} />
          Volver a Planes semanales
        </A>
      </AppShellSubheader>

      <WeeklyPlanTab />
    </div>
  );
}
