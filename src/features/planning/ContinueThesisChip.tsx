import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { simulationResultsHref } from '../../core/utils/simulationLinks';

interface ContinueThesisChipProps {
  simulationId: number;
}

/** Enlace discreto a la última corrida de escenarios (tesis), separado del hub operativo. */
export function ContinueThesisChip(props: ContinueThesisChipProps) {
  return (
    <A
      href={simulationResultsHref(props.simulationId)}
      class="inline-flex items-center gap-1.5 rounded-full border border-default bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:border-violet-300/60 hover:bg-violet-50/50 hover:text-text-primary dark:hover:border-violet-800/40 dark:hover:bg-violet-950/20"
      data-testid="last-scenario-run-chip"
    >
      <span>Última corrida de escenarios</span>
      <ArrowRight size={12} class="text-text-muted" aria-hidden="true" />
      <span class="font-medium text-fero-blue">Ver</span>
    </A>
  );
}
