import { A } from '@solidjs/router';

type NoticeVariant = 'thesis' | 'operations';

interface ThesisVsOperationsNoticeProps {
  variant: NoticeVariant;
  class?: string;
}

const copy: Record<NoticeVariant, { title: string; body: string; linkHref: string; linkLabel: string }> = {
  thesis: {
    title: 'Historial de tesis — no confundir con operación diaria',
    body: 'Aquí solo aparecen escenarios de evaluación del algoritmo. Las rutas despachadas del día están en Planificación operativa.',
    linkHref: '/optimization',
    linkLabel: 'Ir a planificación operativa',
  },
  operations: {
    title: 'Historial operativo — no confundir con simulación de tesis',
    body: 'Solo corridas iniciadas desde esta pantalla (plan del día). Los escenarios de investigación están en Simulación.',
    linkHref: '/simulation?view=history',
    linkLabel: 'Ver historial de tesis',
  },
};

export function ThesisVsOperationsNotice(props: ThesisVsOperationsNoticeProps) {
  const content = () => copy[props.variant];
  return (
    <div
      class={`rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-text-secondary dark:border-dark-border dark:bg-dark-surface/40 ${props.class ?? ''}`}
    >
      <p class="font-semibold text-text-primary dark:text-white">{content().title}</p>
      <p class="mt-1">
        {content().body}{' '}
        <A href={content().linkHref} class="font-medium text-fero-blue hover:underline">
          {content().linkLabel}
        </A>
        .
      </p>
    </div>
  );
}
