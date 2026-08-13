import { type JSX, Show, splitProps } from 'solid-js';

interface TextFieldProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class'> {
  label?: string;
  leadingIcon?: JSX.Element;
  trailing?: JSX.Element;
  class?: string;
  inputClass?: string;
}

export function TextField(props: TextFieldProps) {
  const [local, others] = splitProps(props, [
    'label',
    'leadingIcon',
    'trailing',
    'class',
    'inputClass',
    'id',
  ]);

  const inputId = () => local.id ?? (local.label ? `field-${local.label}` : undefined);

  return (
    <div class={local.class}>
      <Show when={local.label}>
        <label
          for={inputId()}
          class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white"
        >
          {local.label}
        </label>
      </Show>
      <div class="relative">
        <Show when={local.leadingIcon}>
          <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            {local.leadingIcon}
          </span>
        </Show>
        <input
          id={inputId()}
          class={`w-full rounded-md border border-default bg-elevated py-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 ${
            local.leadingIcon ? 'pl-11' : 'pl-4'
          } ${local.trailing ? 'pr-11' : 'pr-4'} ${local.inputClass ?? ''}`}
          {...others}
        />
        <Show when={local.trailing}>
          <div class="absolute right-3 top-1/2 -translate-y-1/2">{local.trailing}</div>
        </Show>
      </div>
    </div>
  );
}
