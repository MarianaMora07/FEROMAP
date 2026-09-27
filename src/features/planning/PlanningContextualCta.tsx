import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Button } from '../../design-system/components';

interface PlanningContextualCtaProps {
  message: string;
  href: string;
  linkLabel: string;
  tone?: 'success' | 'info';
  icon?: JSX.Element;
}

const toneClass = {
  success: 'border-fero-green/40 bg-fero-green/10',
  info: 'border-fero-blue/30 bg-fero-blue/10',
};

const titleClass = {
  success: 'text-fero-green-dark',
  info: 'text-fero-blue',
};

export function PlanningContextualCta(props: PlanningContextualCtaProps) {
  const tone = () => props.tone ?? 'success';
  return (
    <div
      class={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${toneClass[tone()]}`}
    >
      <p class={`text-sm font-medium ${titleClass[tone()]}`}>{props.message}</p>
      <A href={props.href}>
        <Button variant="outline" size="sm" class="gap-2 shrink-0" icon={props.icon ?? <ArrowRight size={14} />}>
          {props.linkLabel}
        </Button>
      </A>
    </div>
  );
}
