import { createSignal, onMount, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';

export interface SkeletonProps {
  variant?: 'text' | 'card' | 'kpi' | 'chart' | 'table' | 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
  className?: string;
  animated?: boolean;
  rows?: number;
  cols?: number;
}

export function Skeleton({
  variant = 'rect',
  width = '100%',
  height = '1rem',
  className = '',
  animated = true,
  rows = 1,
  cols = 1,
}: SkeletonProps) {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));
  onCleanup(() => setMounted(false));

  const baseStyles = `
    ${animated ? 'animate-pulse' : ''}
    bg-slate-200 dark:bg-slate-700
    rounded
    overflow-hidden
    ${className}
  `;

  const getStyles = () => {
    const w = typeof width === 'number' ? `${width}px` : width;
    const h = typeof height === 'number' ? `${height}px` : height;
    return `width: ${w}; height: ${h};`;
  };

  if (!mounted) return <div className="invisible" style={getStyles()} />;

  switch (variant) {
    case 'text':
      return (
        <div className={`space-y-2 ${className}`}>
          <For each={Array.from({ length: rows })}>
            {(_, i) => (
              <div key={i} className="rounded" style={{ width: cols === 1 ? '60%' : '100%', height: '1rem', ...{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' } }} />
            )}
          </For>
        </div>
      );

    case 'card':
      return (
        <div className={`rounded-xl border border-default bg-surface ${className}`} style={{ width, height }}>
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-8 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="space-y-2">
              <For each={Array.from({ length: 3 })}>
                {(_, i) => <div key={i} className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />}
              </For>
            </div>
          </div>
        </div>
      );

    case 'kpi':
      return (
        <div className={`rounded-xl border border-default bg-surface p-4 space-y-3 ${className}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="h-8 w-8 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse ml-auto" />
          </div>
          <div className="space-y-1">
            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-8 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="h-16 -mx-4 bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
      );

    case 'chart':
      return (
        <div className={`rounded-xl border border-default bg-surface p-4 ${className}`}>
          <div className="mb-2">
            <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
      );

    case 'table':
      return (
        <div className={`rounded-xl border border-default bg-surface ${className}`}>
          <div className="p-4 border-b border-default">
            <div className="flex items-center justify-between">
              <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          </div>
          <div className="divide-y divide-default">
            <For each={Array.from({ length: rows })}>
              {(_, i) => (
                <div key={i} className="p-4">
                  <div className="grid gap-2">
                    <For each={Array.from({ length: cols })}>
                      {(_, j) => <div key={j} className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      );

    case 'circle':
      return (
        <div className={`rounded-full ${className}`} style={{ width, height, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
      );

    case 'rect':
    default:
      return (
        <div className={baseStyles} style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height }} />
      );
  }
}

export function SkeletonGrid({ rows = 4, cols = 5, gap = 3, variant = 'kpi', className = '' }: { rows?: number; cols?: number; gap?: number; variant?: 'kpi' | 'chart' | 'card'; className?: string }) {
  return (
    <div className={`grid gap-${gap} ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      <For each={Array.from({ length: rows * cols })}>
        {(_, i) => <Skeleton key={i} variant={variant} />}
      </For>
    </div>
  );
}

export function Shimmer({ children, className = '' }: { children: JSX.Element; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
    </div>
  );
}

// Añadir keyframes globalmente si no existen
if (typeof document !== 'undefined' && !document.getElementById('skeleton-shimmer')) {
  const style = document.createElement('style');
  style.id = 'skeleton-shimmer';
  style.textContent = `
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    .animate-pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  `;
  document.head.appendChild(style);
}