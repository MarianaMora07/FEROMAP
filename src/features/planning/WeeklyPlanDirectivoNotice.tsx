import { A } from '@solidjs/router';

interface WeeklyPlanDirectivoNoticeProps {
  class?: string;
}

export function WeeklyPlanDirectivoNotice(props: WeeklyPlanDirectivoNoticeProps) {
  return (
    <div
      class={`rounded-xl border border-violet-300/50 bg-violet-50/80 px-4 py-3 text-sm dark:border-violet-900/40 dark:bg-violet-950/20 ${props.class ?? ''}`}
      data-testid="weekly-plan-directivo-notice"
    >
      <p class="font-semibold text-violet-900 dark:text-violet-100">
        Planificación directiva — no es simulación de tesis
      </p>
      <p class="mt-1 text-text-secondary">
        Aquí apruebas qué puntos visitar cada día antes de operar rutas. Para evaluar el algoritmo en modo
        investigación, usa{' '}
        <A href="/simulation" class="font-medium text-fero-blue hover:underline">
          Simulación de escenarios
        </A>
        .{' '}
        <A href="/planning" class="font-medium text-fero-blue hover:underline">
          Volver al hub de planificación
        </A>
        .
      </p>
    </div>
  );
}
