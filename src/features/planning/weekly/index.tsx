import { A } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import { Button } from '../../../design-system/components';
import { WeeklyPlanTab } from '../../simulation/WeeklyPlanTab';
import { CollapsiblePlanningGlossary } from '../CollapsiblePlanningGlossary';
import { WeeklyPlanDirectivoNotice } from '../WeeklyPlanDirectivoNotice';

export default function PlanningWeeklyPage() {
  return (
    <div class="space-y-4" data-testid="planning-weekly-page">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
            Planificación directiva
          </p>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Plan semanal</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Configura, valida y aprueba la semana antes de optimizar el día.
          </p>
        </div>
        <A href="/planning">
          <Button variant="outline" size="sm" class="gap-2" icon={<ArrowLeft size={14} />}>
            Hub de planificación
          </Button>
        </A>
      </div>

      <WeeklyPlanDirectivoNotice />
      <CollapsiblePlanningGlossary />
      <WeeklyPlanTab embedded />
    </div>
  );
}
