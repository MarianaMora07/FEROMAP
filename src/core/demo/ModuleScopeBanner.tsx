import { A } from '@solidjs/router';

export type ModuleScopeId = 'operations' | 'thesis-simulation' | 'aco-demonstration' | 'analytics-mock';

const DEFINITIONS: Record<
  ModuleScopeId,
  { title: string; body: string; testId: string; toneClass: string }
> = {
  operations: {
    title: 'Planificación operativa del día',
    body: 'Flujo real: plan semanal → optimizar → despachar → monitoreo, chofer y residente.',
    testId: 'module-banner-operations',
    toneClass: 'border-fero-blue/30 bg-fero-blue/5 dark:border-fero-blue/40 dark:bg-fero-blue/10',
  },
  'thesis-simulation': {
    title: 'Simulación de tesis',
    body: 'Compara baseline vs ACO en escenario normal. No despacha rutas ni sustituye la operación diaria.',
    testId: 'module-banner-thesis-simulation',
    toneClass: 'border-fero-green/30 bg-fero-green/5 dark:border-fero-green/30 dark:bg-fero-green/10',
  },
  'aco-demonstration': {
    title: 'Demostración didáctica ACO',
    body: 'Convergencia del algoritmo (~2 min del guion). No es el plan del turno ni la simulación completa.',
    testId: 'module-banner-aco-demonstration',
    toneClass:
      'border-violet-300/50 bg-violet-50/80 dark:border-violet-900/40 dark:bg-violet-950/25',
  },
  'analytics-mock': {
    title: 'Datos de ejemplo — fuera del guion de defensa',
    body: 'KPIs y gráficos ilustrativos con mocks. Para evidencia operativa usa monitoreo, reportes o la simulación de tesis.',
    testId: 'module-banner-analytics-mock',
    toneClass:
      'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  },
};

interface ModuleScopeBannerProps {
  scope: ModuleScopeId;
  class?: string;
  linkHref?: string;
  linkLabel?: string;
}

export function ModuleScopeBanner(props: ModuleScopeBannerProps) {
  const definition = () => DEFINITIONS[props.scope];
  return (
    <div
      class={`rounded-lg border px-3 py-2.5 text-sm ${definition().toneClass} ${props.class ?? ''}`}
      data-testid={definition().testId}
    >
      <p class="font-semibold text-text-primary dark:text-white">{definition().title}</p>
      <p class="mt-1 text-text-secondary">
        {definition().body}
        {props.linkHref && props.linkLabel ? (
          <>
            {' '}
            <A href={props.linkHref} class="font-medium text-fero-blue hover:underline">
              {props.linkLabel}
            </A>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
