import type { JSX } from 'solid-js';

interface ResidentLevelBannerProps {
  title?: string;
  children?: JSX.Element;
}

export function ResidentLevelBanner(props: ResidentLevelBannerProps) {
  return (
    <div
      role="status"
      class="rounded-xl border border-fero-blue/30 bg-gradient-to-r from-fero-blue/15 via-fero-blue/8 to-transparent px-4 py-2.5 text-sm dark:border-fero-blue/40"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full border border-fero-blue/30 bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fero-blue">
          Ciudadano
        </span>
        <p class="font-semibold text-fero-blue">{props.title ?? 'Vista ciudadano — solo tu sector'}</p>
      </div>
      {props.children ? <div class="mt-1.5">{props.children}</div> : null}
    </div>
  );
}
