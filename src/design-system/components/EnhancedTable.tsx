import { For, createMemo, createSignal, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { ChevronUp, ChevronDown } from 'lucide-solid';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: any) => JSX.Element;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  class?: string;
  headerClass?: string;
  cellClass?: string;
}

interface EnhancedTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  class?: string;
  striped?: boolean;
  hoverable?: boolean;
  stickyHeader?: boolean;
  showBorders?: boolean;
  compact?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  loadingRows?: number;
  caption?: string;
  footer?: JSX.Element;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  onRowClick?: (item: T) => void;
  rowClass?: (item: T) => string;
  captionClass?: string;
}

interface Column<T> {
  key: string;
  header: string;
  render?: (item: any) => JSX.Element;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  class?: string;
  headerClass?: string;
  cellClass?: string;
}

const ALIGN_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const ALIGN_HEADER_CLASSES = {
  left: '',
  center: 'text-center',
  right: 'text-right',
};

function getAlignClass(align?: 'left' | 'center' | 'right', isHeader = false) {
  return isHeader ? ALIGN_HEADER_CLASSES[align ?? 'left'] : ALIGN_CLASSES[align ?? 'left'];
}

export function EnhancedTable<T extends Record<string, any>>(props: EnhancedTableProps<any>) {
  const {
    columns,
    data,
    keyExtractor,
    onRowClick,
    emptyMessage = 'No hay datos',
    class: className = '',
    striped = true,
    hoverable = true,
    stickyHeader = true,
    showBorders = true,
    compact = false,
    emptyMessage = 'No hay datos disponibles',
    caption,
    loading = false,
    loadingRows = 5,
    footer,
    onSort,
    defaultSortKey,
    defaultSortDir = 'asc',
    onRowClick,
    rowClass,
    captionClass,
  } = props;

  const [sortKey, setSortKey] = createSignal<string>(defaultSortKey ?? '');
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc');
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key, sortKey() === key && sortDir() === 'asc' ? 'desc' : 'asc');
    }
    if (sortKey() === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedColumns = createMemo(() =>
    props.columns.map((col) => ({
      ...col,
      align: col.align ?? 'left',
      headerClass: col.headerClass ?? '',
      cellClass: col.cellClass ?? '',
      width: col.width,
    }))
  );

  const sortedData = createMemo(() => {
    const key = sortKey();
    if (!key) return props.data;
    return [...props.data].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      const dir = sortDir() === 'asc' ? 1 : -1;
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return dir;
      if (bVal == null) return -dir;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  });

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key, sortKey() === key && sortDir() === 'asc' ? 'desc' : 'asc');
    }
    if (sortKey() === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleRowClick = (item: any) => {
    onRowClick?.(item);
    props.onRowClick?.(item);
  };

  const rowStyle = (item: any) => {
    const customClass = rowClass?.(item) ?? '';
    return `transition-all duration-150 hover:bg-app/50 ${props.hoverable ? 'cursor-pointer' : ''} ${props.onRowClick ? 'cursor-pointer' : ''} ${customClass}`;
  };

  if (!mounted) {
    return (
      <div class={`w-full ${className}`}>
        <div class="overflow-hidden rounded-xl border border-default bg-surface">
          <div class="overflow-x-auto">
            <table class="w-full" role="grid">
              <thead>
                <tr class="bg-app border-b border-default">
                  <For each={columns}>
                    {(col) => (
                      <th
                        key={col.key}
                        scope="col"
                        class={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted ${col.headerClass ?? ''}`}
                        style={{ width: col.width }}
                      >
                        {col.header}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={Array.from({ length: 5 })} fallback={<div />}>
                  {(_, i) => (
                    <tr key={i} class="animate-pulse">
                      <For each={columns}>
                        {(col) => (
                          <td key={col.key} class="px-4 py-3">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-3/4" />
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
      </div>
    );
  }

  return (
    <div class={`w-full ${className}`} data-testid="enhanced-table">
      <div class="overflow-hidden rounded-xl border border-default bg-surface">
        {caption && (
          <caption class={`px-4 py-2 text-sm font-medium text-text-secondary ${captionClass ?? ''}`}>
            {caption}
          </caption>
        )}

        <div class="overflow-x-auto">
          <table class="w-full" role="grid">
            <thead>
              <tr class={`bg-app ${showBorders ? 'border-b border-default' : ''} ${stickyHeader ? 'sticky top-0 z-10 bg-app/95 backdrop-blur-sm' : ''}`}>
                <For each={columns}>
                  {(col) => (
                    <th
                      key={col.key}
                      scope="col"
                      class={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted ${col.headerClass ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-text-secondary' : ''} ${getAlignClass(col.align, true)}`}
                      style={{ width: col.width }}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      <div class="flex items-center gap-1">
                        <span>{col.header}</span>
                        {col.sortable && sortKey() === col.key && (
                          <span class="text-fero-blue" aria-hidden="true">
                            {sortDir() === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/50 dark:divide-dark-border/50">
              <For each={sortedData()}>
                {(item) => (
                  <tr
                    key={keyExtractor(item)}
                    class={`transition-all duration-150 hover:bg-app/50 ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={() => handleRowClick(item)}
                    style={rowStyle}
                  >
                    <For each={columns}>
                      {(col) => (
                        <td
                          key={col.key}
                          class={`px-4 py-3 text-sm text-text-primary ${col.cellClass ?? ''} ${getAlignClass(col.align)}`}
                          style={{ width: col.width }}
                        >
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
    </div>
  );
}

function getAlignClass(align?: 'left' | 'center' | 'right', isHeader = false) {
  return isHeader ? ALIGN_HEADER_CLASSES[align ?? 'left'] : ALIGN_CLASSES[align ?? 'left'];
}

const ALIGN_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const ALIGN_HEADER_CLASSES = {
  left: '',
  center: 'text-center',
  right: 'text-right',
};

export type { Column, EnhancedTableProps };