import { type JSX, Show, splitProps } from 'solid-js';

interface SelectFieldProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class'> {
  label?: string;
  class?: string;
  selectClass?: string;
  children: JSX.Element;
}

export function SelectField(props: SelectFieldProps) {
  const [local, others] = splitProps(props, ['label', 'class', 'selectClass', 'id', 'children']);
  const selectId = () => local.id ?? (local.label ? `select-${local.label}` : undefined);

  return (
    <div class={local.class}>
      <Show when={local.label}>
        <label
          for={selectId()}
          class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white"
        >
          {local.label}
        </label>
      </Show>
      <select
        id={selectId()}
        class={`w-full appearance-none rounded-md border border-border bg-surface bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat py-3 pl-4 pr-10 text-sm text-text-primary transition-colors focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white ${local.selectClass ?? ''}`}
        style={{
          'background-image':
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...others}
      >
        {local.children}
      </select>
    </div>
  );
}
