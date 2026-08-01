import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { CheckCircle2, MoreVertical, Wrench } from 'lucide-solid';
import type { Vehicle } from '../../data/mock/vehicles';

interface VehicleActionsMenuProps {
  vehicle: Vehicle;
  disabled?: boolean;
  onSetMaintenance: (vehicle: Vehicle) => void | Promise<void>;
  onSetAvailable: (vehicle: Vehicle) => void | Promise<void>;
  variant?: 'icon' | 'button';
}

export function VehicleActionsMenu(props: VehicleActionsMenuProps) {
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

  const runAction = async (action: (vehicle: Vehicle) => void | Promise<void>) => {
    setOpen(false);
    await action(props.vehicle);
  };

  const canMarkMaintenance = () =>
    props.vehicle.status === 'disponible' || props.vehicle.status === 'en-ruta';
  const canMarkAvailable = () => props.vehicle.status === 'mantenimiento';

  return (
    <div ref={rootRef} class="relative inline-flex">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary"
        aria-label="Más acciones"
        disabled={props.disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreVertical size={16} />
      </button>

      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-30 mt-1 min-w-48 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg dark:border-dark-border dark:bg-dark-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <For
            each={[
              {
                id: 'maintenance',
                label: 'Marcar en mantenimiento',
                icon: Wrench,
                hidden: !canMarkMaintenance(),
                action: () => runAction(props.onSetMaintenance),
              },
              {
                id: 'available',
                label: 'Marcar disponible',
                icon: CheckCircle2,
                hidden: !canMarkAvailable(),
                action: () => runAction(props.onSetAvailable),
              },
            ].filter((item) => !item.hidden)}
          >
            {(item) => (
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-hover"
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
