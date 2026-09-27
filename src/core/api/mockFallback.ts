import { globalToast } from '../stores/toastStore';

const NOTIFIED_LABELS = new Set<string>();

function shouldShowFallbackToast(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_MOCK_FALLBACK_TOAST !== 'false';
}

/**
 * Aviso de que una vista está usando datos locales porque `VITE_USE_MOCKS=true`.
 * Es informativo y solo ocurre en dev.
 *
 * Los **errores de API** no pasan por aquí: `withMockFallback` los propaga cuando
 * los mocks están desactivados. La superficie de error visible en producción se
 * añade en la fase de observabilidad (F3), no en esta.
 */
export function notifyMockFallback(label: string): void {
  if (!import.meta.env.DEV) return;
  if (NOTIFIED_LABELS.has(label)) return;

  console.warn(`[FEROMAP] Mock mode (${label}): VITE_USE_MOCKS=true — datos locales`);
  NOTIFIED_LABELS.add(label);

  if (shouldShowFallbackToast()) {
    globalToast.addToast(`[Mock] ${label}: modo mock activo`, 'warning');
  }
}

export function logMockModeEnabled(): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS !== 'true') return;

  console.info(
    '[FEROMAP] VITE_USE_MOCKS=true — las vistas con withMockFallback usarán datos locales.',
  );
}

export function resetMockFallbackNotifications(): void {
  NOTIFIED_LABELS.clear();
}
