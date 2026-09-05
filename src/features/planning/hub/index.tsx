import { A } from '@solidjs/router';
import { CalendarDays, Radio } from 'lucide-solid';
import { Button } from '../../../design-system/components';
import { weeklyPlanHref } from '../../../core/planning/weeklyPlanLinks';
import { PlannerHubSection } from '../PlannerHubSection';
import { ModuleScopeBanner } from '../../../core/demo/ModuleScopeBanner';

export default function PlanningHubPage() {
  return (
    <div class="space-y-5">
      <ModuleScopeBanner scope="operations" />
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Hub de planificación</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Semana directiva → día administrativo → despacho → monitoreo y campo.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A href={weeklyPlanHref}>
            <Button variant="primary" size="sm" class="gap-2" icon={<CalendarDays size={14} />}>
              Plan semanal
            </Button>
          </A>
          <A href="/monitoring">
            <Button variant="outline" size="sm" class="gap-2" icon={<Radio size={14} />}>
              Monitoreo
            </Button>
          </A>
        </div>
      </div>

      <PlannerHubSection variant="landing" />
    </div>
  );
}
