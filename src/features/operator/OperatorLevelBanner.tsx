import type { JSX } from 'solid-js';

interface OperatorLevelBannerProps {
  title?: string;
  children?: JSX.Element;
}

export function OperatorLevelBanner(props: OperatorLevelBannerProps) {
  return (
    <div class="rounded-xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full border border-amber-700/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Campo
        </span>
        <p class="font-semibold text-amber-800 dark:text-amber-200">
          {props.title ?? 'Operación en campo'}
        </p>
      </div>
      <p class="mt-1 text-text-secondary">
        <span class="font-medium text-text-primary dark:text-white">Glosario:</span> Ejecuta tu ruta,
        reporta incidencias y consulta el avance — sin planificar ni despachar.
      </p>
      {props.children ? <div class="mt-2">{props.children}</div> : null}
    </div>
  );
}
