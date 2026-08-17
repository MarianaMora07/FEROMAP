import { A } from '@solidjs/router';

interface ThesisVsOperationsNoticeProps {
  class?: string;
}

export function ThesisVsOperationsNotice(props: ThesisVsOperationsNoticeProps) {
  return (
    <div
      class={`rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-text-secondary dark:border-dark-border dark:bg-dark-surface/40 ${props.class ?? ''}`}
    >
      <p class="font-semibold text-text-primary dark:text-white">
        Historial de simulaciones — no confundir con operación diaria
      </p>
      <p class="mt-1">
        Aquí solo aparecen escenarios de evaluación del algoritmo. Las rutas despachadas del día están en
        Planificación operativa.{' '}
        <A href="/optimization" class="font-medium text-fero-blue hover:underline">
          Ir a planificación operativa
        </A>
        .
      </p>
    </div>
  );
}
