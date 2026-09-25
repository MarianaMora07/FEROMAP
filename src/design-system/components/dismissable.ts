import { createEffect, onCleanup } from 'solid-js';

export interface DismissableOptions {
  open: () => boolean;
  onDismiss: () => void;
  /**
   * Nodos cuyo clic/pointer NO debe cerrar (p. ej. el menú y el botón que lo abre).
   * Si el evento cae dentro de cualquiera de ellos, se ignora.
   */
  inside: () => Array<HTMLElement | undefined | null>;
}

/**
 * Cierre consistente de menús y overlays **no modales** (docs/design-system/contratos-ui.md §2):
 * clic-fuera + `Escape`. Los listeners solo existen mientras `open()` es true.
 * Para overlays modales usar `useFocusTrap`.
 */
export function useDismissable(options: DismissableOptions): void {
  createEffect(() => {
    if (!options.open()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (options.inside().some((node) => node?.contains(target))) return;
      options.onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') options.onDismiss();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });
}
