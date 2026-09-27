import { globalToast } from '../stores/toastStore';
import { resolveUrl } from '../api/client';

const REPORTED_KEYS = new Set<string>();
const MAX_TOASTS = 3;

function keyOf(message: string): string {
  return message.slice(0, 240);
}

/**
 * Superficie de error global (F3): avisa al usuario y reporta al backend.
 *
 * Los errores de API con estado >= 500 y los no controlados llegan aquí. Se
 * deduplica por mensaje para no saturar de toasts, y el reporte al backend es
 * best-effort (nunca debe romper el flujo del usuario).
 */
export function reportFrontendError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const dedupeKey = keyOf(message);
  if (REPORTED_KEYS.has(dedupeKey)) return;
  REPORTED_KEYS.add(dedupeKey);

  if (REPORTED_KEYS.size <= MAX_TOASTS) {
    globalToast.addToast(message || 'Ocurrió un error inesperado', 'error');
  }

  const payload = {
    message,
    kind: typeof context?.kind === 'string' ? context.kind : 'error',
    stack: error instanceof Error ? (error.stack ?? null) : null,
    url: typeof window !== 'undefined' ? window.location.href : null,
    context: context ?? null,
  };

  void fetch(resolveUrl('/api/v1/telemetry/frontend-error'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // El reporte de errores nunca debe generar otro error.
  });
}

/** Reporta fallos del servidor o de red; los 4xx los maneja la vista. */
export function reportApiFailure(status: number, message: string): void {
  if (status >= 500 || status === 0) {
    reportFrontendError(new Error(`API ${status}: ${message}`), { kind: 'api' });
  }
}

export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    reportFrontendError(event.error ?? new Error(event.message), { kind: 'unhandled' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportFrontendError(
      event.reason instanceof Error ? event.reason : new Error('Promesa rechazada sin manejar'),
      { kind: 'unhandled-rejection' },
    );
  });
}

export function resetReportedErrors(): void {
  REPORTED_KEYS.clear();
}
