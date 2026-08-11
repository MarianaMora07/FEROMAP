import { A } from '@solidjs/router';
import { Brain } from 'lucide-solid';
import { Button } from '../../../design-system/components';
import { PlannerHubSection } from '../PlannerHubSection';
import { ThesisVsOperationsNotice } from '../ThesisVsOperationsNotice';

export default function PlanningHubPage() {
  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Hub de planificación</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Operación día a día — la simulación de tesis vive en otro módulo.
          </p>
        </div>
        <A href="/simulation">
          <Button variant="outline" size="sm" class="gap-2" icon={<Brain size={14} />}>
            Simulación de tesis
          </Button>
        </A>
      </div>

      <ThesisVsOperationsNotice variant="operations" />

      <PlannerHubSection variant="landing" />
    </div>
  );
}
