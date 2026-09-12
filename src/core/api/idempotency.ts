/**
 * Idempotency-Key para operaciones mutables (F4).
 *
 * Reintentos de red con la misma clave no repiten el efecto en el backend.
 */
export function idempotencyKey(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function idempotencyHeaders(): Record<string, string> {
  return { 'Idempotency-Key': idempotencyKey() };
}
