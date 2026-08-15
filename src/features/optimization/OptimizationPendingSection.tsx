import { createEffect, onCleanup, onMount } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { PendingManagementPanel } from './PendingManagementPanel';

interface OptimizationPendingSectionProps {
  operationDate: string;
  openPendingCount: number;
}

function shouldOpenPendientesFromHash(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash === '#pendientes';
}

export function OptimizationPendingSection(props: OptimizationPendingSectionProps) {
  let detailsRef: HTMLDetailsElement | undefined;

  const applyHashOpen = () => {
    if (!detailsRef) return;
    if (shouldOpenPendientesFromHash()) {
      detailsRef.open = true;
    }
  };

  onMount(() => {
    applyHashOpen();
    const onHashChange = () => applyHashOpen();
    window.addEventListener('hashchange', onHashChange);
    onCleanup(() => window.removeEventListener('hashchange', onHashChange));
  });

  createEffect(() => {
    props.operationDate;
    applyHashOpen();
  });

  const summaryLabel = () => {
    const count = props.openPendingCount;
    if (count <= 0) return 'Sin pendientes abiertos en el plan · Gestionar carry-over';
    return `${count} pendiente${count === 1 ? '' : 's'} abierto${count === 1 ? '' : 's'} · Gestionar`;
  };

  return (
    <details
      ref={detailsRef}
      id="pendientes"
      class="group rounded-xl border border-default bg-elevated shadow-xs"
      data-testid="optimization-pending-section"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">Gestión de pendientes</p>
          <p class="mt-0.5 truncate text-xs text-text-muted">{summaryLabel()}</p>
        </div>
        <ChevronDown
          size={18}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="border-t border-default px-4 py-3">
        <PendingManagementPanel operationDate={props.operationDate} embedded />
      </div>
    </details>
  );
}
