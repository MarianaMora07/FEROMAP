import { type JSX, For, createSignal, Show } from 'solid-js';
import { useLocale } from '../../core/i18n/solid';

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
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  class?: string;
}

export function Table<T extends Record<string, unknown>>(props: TableProps<T>) {
  const tr = useLocale();
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

  const ariaSortFor = (col: Column<T>): 'ascending' | 'descending' | 'none' | undefined => {
    if (!col.sortable) return undefined;
    if (sortKey() !== col.key) return 'none';
    return sortDir() === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div class={`w-full overflow-hidden rounded-[var(--radius-lg)] border border-default ${props.class ?? ''}`}>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-app">
              <For each={props.columns}>
                {(col) => (
                  <th
                    scope="col"
                    aria-sort={ariaSortFor(col)}
                    class={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted ${col.class ?? ''}`}
                  >
                    <Show when={col.sortable} fallback={col.header}>
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        class="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fero-blue"
                      >
                        {col.header}
                        <span class="text-fero-blue" aria-hidden="true">
                          {sortKey() === col.key ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      </button>
                    </Show>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <For
              each={sortedData()}
              fallback={
                <tr>
                  <td colSpan={props.columns.length} class="px-4 py-8 text-center text-text-muted">
                    {props.emptyMessage ?? tr('ui.noData')}
                  </td>
                </tr>
              }
            >
              {(item) => (
                <tr
                  class={`bg-elevated transition-colors hover:bg-app ${
                    props.onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => props.onRowClick?.(item)}
                >
                  <For each={props.columns}>
                    {(col) => (
                      <td class={`px-4 py-3 text-sm text-text-primary ${col.class ?? ''}`}>
                        {col.render ? col.render(item) : String(item[col.key] ?? '')}
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
