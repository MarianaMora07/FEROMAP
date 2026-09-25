import { createEffect, onCleanup } from 'solid-js';

/**
 * Contrato de foco para superficies superpuestas (Modal, Drawer, overlays).
 * Fuente de verdad: `docs/design-system/contratos-ui.md` §2.
 *
 * Mientras `open()` es true: atrapa `Tab`/`Shift+Tab` dentro de `container()`,
 * cierra con `Escape` y, al pasar a false, devuelve el foco al elemento que
 * abrió el overlay. El listener de `Escape` solo existe con el overlay abierto.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true';
}

/** Elementos enfocables y visibles dentro de un contenedor. Exportado para tests. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

export interface FocusTrapOptions {
  /** Señal de apertura; el trap se activa solo mientras es true. */
  open: () => boolean;
  /** Contenedor del overlay (recibe el foco inicial si no hay enfocables). */
  container: () => HTMLElement | undefined;
  /** Acción de cierre disparada por `Escape`. */
  onEscape: () => void;
}

export function useFocusTrap(options: FocusTrapOptions): void {
  createEffect(() => {
    if (!options.open()) return;

    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        options.onEscape();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = options.container();
      if (!container) return;

      const focusables = focusableWithin(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const atBoundary = active === container;

      if (event.shiftKey) {
        if (active === first || atBoundary || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || atBoundary || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    // Foco inicial: `[data-autofocus]` / `[data-modal-autofocus]` o el primer enfocable.
    queueMicrotask(() => {
      const container = options.container();
      if (!container) return;
      const autofocus = container.querySelector<HTMLElement>(
        '[data-autofocus], [data-modal-autofocus]',
      );
      const target = autofocus ?? focusableWithin(container)[0] ?? container;
      target.focus();
    });

    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    });
  });
}
