import type { JSX } from 'solid-js';
import { PLANNING_LEVELS, type PlanningLevel } from '../../core/planning/planningUx';

interface PlanningLevelBannerProps {
  level: PlanningLevel;
  title?: string;
  children?: JSX.Element;
}

export function PlanningLevelBanner(props: PlanningLevelBannerProps) {
  const meta = () => PLANNING_LEVELS[props.level];
  return (
    <div class={`rounded-xl border px-4 py-3 text-sm ${meta().toneClass}`}>
      <div class="flex flex-wrap items-center gap-2">
        <span
          class={`rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta().titleClass}`}
        >
          {meta().shortLabel}
        </span>
        <p class={`font-semibold ${meta().titleClass}`}>{props.title ?? meta().label}</p>
      </div>
      <p class="mt-1 text-text-secondary">
        <span class="font-medium text-text-primary dark:text-white">Glosario:</span> {meta().glossary}
      </p>
      {props.children ? <div class="mt-2">{props.children}</div> : null}
    </div>
  );
}
