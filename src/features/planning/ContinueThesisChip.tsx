import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { Badge } from '../../design-system/components';
import { simulationResultsHref } from '../../core/utils/simulationLinks';

interface ContinueThesisChipProps {
  simulationId: number;
  caseStudyCode?: string | null;
}

/** Enlace discreto a la última corrida de escenarios (tesis), separado del hub operativo. */
export function ContinueThesisChip(props: ContinueThesisChipProps) {
  return (
    <A
      href={simulationResultsHref(props.simulationId)}
      class="inline-flex flex-wrap items-center gap-2 rounded-full border border-default bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:border-violet-300/60 hover:bg-violet-50/50 hover:text-text-primary dark:hover:border-violet-800/40 dark:hover:bg-violet-950/20"
      data-testid="last-scenario-run-chip"
    >
      <Show when={props.caseStudyCode}>
        {(code) => (
          <Badge variant="success" class="!rounded-full !px-2 !py-0.5 text-[10px]">
            Caso: {code()}
          </Badge>
        )}
      </Show>
      <span>Última corrida de escenarios</span>
      <ArrowRight size={12} class="text-text-muted" aria-hidden="true" />
      <span class="font-medium text-fero-blue">Ver</span>
    </A>
  );
}
