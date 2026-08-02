import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Ban, MoreVertical, Sparkles, Trash2 } from 'lucide-solid';
import type { CollectionPoint } from '../../core/types/collectionPoint';

interface CollectionPointActionsMenuProps {
  point: CollectionPoint;
  disabled?: boolean;
  onOutOfService: (point: CollectionPoint) => void | Promise<void>;
  onDelete: (point: CollectionPoint) => void | Promise<void>;
  onToggleOptimization?: (point: CollectionPoint, enabled: boolean) => void | Promise<void>;
  triggerLabel?: string;
  variant?: 'icon' | 'button';
}

export function CollectionPointActionsMenu(props: CollectionPointActionsMenuProps) {
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!open()) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef && target && !rootRef.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  const runAction = async (action: (point: CollectionPoint) => void | Promise<void>) => {
    setOpen(false);
    await action(props.point);
  };

  return (
    <div ref={rootRef} class="relative inline-flex">
      <Show
        when={props.variant === 'button'}
        fallback={
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
            aria-label="Más acciones"
            disabled={props.disabled}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((value) => !value);
            }}
          >
            <MoreVertical size={14} />
          </button>
        }
      >
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          disabled={props.disabled}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {props.triggerLabel ?? 'Más acciones'}
          <MoreVertical size={14} class="opacity-70" />
        </button>
      </Show>

      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg dark:border-dark-border dark:bg-dark-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <For each={[
            {
              id: 'optimization',
              label: props.point.priorityBoost
                ? 'Quitar de próxima optimización'
                : 'Incluir en próxima optimización',
              icon: Sparkles,
              hidden: !props.onToggleOptimization,
              action: () => {
                setOpen(false);
                void props.onToggleOptimization?.(props.point, !props.point.priorityBoost);
              },
            },
            {
              id: 'out-of-service',
              label: 'Fuera de servicio',
              icon: Ban,
              hidden: props.point.status === 'fuera-de-servicio',
              action: () => runAction(props.onOutOfService),
            },
            {
              id: 'delete',
              label: 'Eliminar',
              icon: Trash2,
              danger: true,
              action: () => runAction(props.onDelete),
            },
          ].filter((item) => !item.hidden)}>
            {(item) => (
              <button
                type="button"
                class={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover ${
                  item.danger ? 'text-red-600' : 'text-text-secondary'
                }`}
                onClick={item.action}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
