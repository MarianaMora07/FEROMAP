import { A } from '@solidjs/router';
import type { JSX } from 'solid-js';

interface ModuleGuidanceBannerProps {
  tone: 'simulation' | 'optimization';
  title: string;
  children: JSX.Element;
  linkHref: string;
  linkLabel: string;
}

const toneClass = {
  simulation: 'border-fero-green/30 bg-fero-green/10',
  optimization: 'border-fero-blue/30 bg-fero-blue/10',
};

const titleClass = {
  simulation: 'text-fero-green-dark',
  optimization: 'text-fero-blue',
};

export function ModuleGuidanceBanner(props: ModuleGuidanceBannerProps) {
  return (
    <div class={`rounded-xl border px-4 py-3 text-sm text-text-secondary ${toneClass[props.tone]}`}>
      <p class={`font-semibold ${titleClass[props.tone]}`}>{props.title}</p>
      <p class="mt-1">
        {props.children}{' '}
        <A href={props.linkHref} class={`font-medium underline-offset-2 hover:underline ${titleClass[props.tone]}`}>
          {props.linkLabel}
        </A>
        .
      </p>
    </div>
  );
}
