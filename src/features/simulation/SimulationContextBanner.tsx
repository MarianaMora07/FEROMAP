import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { ArrowLeft, BarChart3, FileText } from 'lucide-solid';
import { analyticsHref, reportsHref, simulationResultsHref } from '../../core/utils/simulationLinks';

interface SimulationContextBannerProps {
  simulationId: number | null;
  page: 'analytics' | 'reports';
}

export function SimulationContextBanner(props: SimulationContextBannerProps) {
  return (
    <Show when={props.simulationId}>
      {(id) => (
        <div class="rounded-xl border border-fero-green/30 bg-fero-green/10 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-fero-green-dark">Contexto de simulación #{id()}</p>
              <p class="mt-0.5 text-sm text-text-secondary">
                {props.page === 'analytics'
                  ? 'Explora métricas con el contexto de la simulación seleccionada.'
                  : 'Genera y descarga reportes relacionados con esta simulación.'}
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <A
                href={simulationResultsHref(id())}
                class="inline-flex items-center gap-1 text-sm font-medium text-fero-green-dark hover:underline"
              >
                <ArrowLeft size={14} />
                Volver a resultados
              </A>
              <Show when={props.page === 'reports'}>
                <A
                  href={analyticsHref(id())}
                  class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
                >
                  <BarChart3 size={14} />
                  Ver en analítica
                </A>
              </Show>
              <Show when={props.page === 'analytics'}>
                <A
                  href={reportsHref(id())}
                  class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
                >
                  <FileText size={14} />
                  Ir a reportes
                </A>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
