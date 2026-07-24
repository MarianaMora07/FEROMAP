import { type JSX, For, createSignal, Show } from 'solid-js';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => JSX.Element;
  sortable?: boolean;
  class?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  selectable?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  class?: string;
}

export function Table<T extends Record<string, any>>(props: TableProps<T>) {
  const [sortKey, setSortKey] = createSignal('');
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey() === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = () => {
    const key = sortKey();
    if (!key) return props.data;
    return [...props.data].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      const dir = sortDir() === 'asc' ? 1 : -1;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  };

  return (
    <div class={`w-full overflow-hidden rounded-[var(--radius-lg)] border border-border dark:border-dark-border ${props.class ?? ''}`}>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-hover dark:bg-dark-surface-hover">
              <For each={props.columns}>
                {(col) => (
                  <th
                    class={`px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer hover:text-text-secondary' : ''
                    } ${col.class ?? ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span class="inline-flex items-center gap-1">
                      {col.header}
                      <Show when={col.sortable && sortKey() === col.key}>
                        <span class="text-fero-blue">{sortDir() === 'asc' ? '↑' : '↓'}</span>
                      </Show>
                    </span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={sortedData()} fallback={
              <tr>
                <td colSpan={props.columns.length} class="px-4 py-8 text-center text-text-muted">
                  {props.emptyMessage ?? 'Sin datos'}
                </td>
              </tr>
            }>
              {(item) => (
                <tr
                  class={`bg-surface hover:bg-surface-hover dark:bg-dark-surface dark:hover:bg-dark-surface-hover transition-colors ${
                    props.onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => props.onRowClick?.(item)}
                >
                  <For each={props.columns}>
                    {(col) => (
                      <td class={`px-4 py-3 text-sm text-text-primary dark:text-slate-200 ${col.class ?? ''}`}>
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
