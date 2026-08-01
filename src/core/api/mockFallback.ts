import { globalToast } from '../stores/toastStore';

const NOTIFIED_LABELS = new Set<string>();

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function shouldShowFallbackToast(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_MOCK_FALLBACK_TOAST !== 'false';
}

export function notifyMockFallback(label: string, error: unknown, reason: 'forced' | 'api-error'): void {
  if (!import.meta.env.DEV) return;

  if (!NOTIFIED_LABELS.has(label)) {
    const detail =
      reason === 'forced'
        ? 'VITE_USE_MOCKS=true — datos locales en lugar de API'
        : formatError(error);

    console.warn(`[FEROMAP] Mock fallback (${label}): ${detail}`, error);
    NOTIFIED_LABELS.add(label);

    if (shouldShowFallbackToast()) {
      globalToast.addToast(
        reason === 'forced'
          ? `[Mock] ${label}: modo mock activo`
          : `[Mock] ${label}: API no disponible`,
        'warning',
      );
    }
  }
}

export function logMockModeEnabled(): void {
  if (!import.meta.env.DEV || !import.meta.env.VITE_USE_MOCKS) return;

  console.info(
    '[FEROMAP] VITE_USE_MOCKS=true — las vistas con withMockFallback usarán datos locales.',
  );
}

export function resetMockFallbackNotifications(): void {
  NOTIFIED_LABELS.clear();
}
