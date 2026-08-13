import type { JSX } from 'solid-js';

interface ResidentLevelBannerProps {
  title?: string;
  children?: JSX.Element;
}

export function ResidentLevelBanner(props: ResidentLevelBannerProps) {
  return (
    <div
      role="status"
      class="rounded-xl border border-fero-blue/30 bg-fero-blue/10 px-4 py-3 text-sm dark:border-fero-blue/40 dark:bg-fero-blue/5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full border border-fero-blue/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fero-blue">
          Ciudadano
        </span>
        <p class="font-semibold text-fero-blue">{props.title ?? 'Vista ciudadano — solo tu sector'}</p>
      </div>
      <p class="mt-1 text-text-secondary">
        <span class="font-medium text-text-primary dark:text-white">Glosario:</span> Consulta horario,
        proximidad del camión y estado de tu barrio — sin acceso a planificación ni monitoreo de flota.
      </p>
      {props.children ? <div class="mt-2">{props.children}</div> : null}
    </div>
  );
}
