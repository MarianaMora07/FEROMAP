import { A } from '@solidjs/router';
import { Brain, CalendarDays } from 'lucide-solid';
import { Button } from '../../../design-system/components';
import { weeklyPlanHref } from '../../../core/planning/weeklyPlanLinks';
import { PlannerHubSection } from '../PlannerHubSection';

export default function PlanningHubPage() {
  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Hub de planificación</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <A href={weeklyPlanHref}>
            <Button variant="primary" size="sm" class="gap-2" icon={<CalendarDays size={14} />}>
              Plan semanal
            </Button>
          </A>
          <A href="/simulation">
            <Button variant="outline" size="sm" class="gap-2" icon={<Brain size={14} />}>
              Simulación de escenarios
            </Button>
          </A>
        </div>
      </div>

      <PlannerHubSection variant="landing" />
    </div>
  );
}
