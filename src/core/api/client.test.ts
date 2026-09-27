import { afterEach, describe, expect, it, vi } from 'vitest';

// `client.ts` importa `mockFallback`, que a su vez carga el store de toasts
// (dependiente del DOM). El entorno de tests es `node`, así que se aísla aquí.
vi.mock('./mockFallback', () => ({ notifyMockFallback: vi.fn() }));

async function loadClient(mocks: boolean) {
  vi.resetModules();
  vi.stubEnv('VITE_USE_MOCKS', mocks ? 'true' : 'false');
  vi.stubEnv('VITE_MOCK_FALLBACK_TOAST', 'false');
  return import('./client');
}

describe('withMockFallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('devuelve el fallback y no llama al API cuando VITE_USE_MOCKS=true', async () => {
    const { withMockFallback } = await loadClient(true);
    const fetcher = vi.fn().mockRejectedValue(new Error('no debería llamarse'));

    await expect(withMockFallback('demo', fetcher, ['local'])).resolves.toEqual(['local']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propaga el error de API cuando VITE_USE_MOCKS=false (sin disfrazarlo)', async () => {
    const { withMockFallback } = await loadClient(false);
    const error = new Error('API caída');
    const fetcher = vi.fn().mockRejectedValue(error);

    await expect(withMockFallback('real', fetcher, ['local'])).rejects.toBe(error);
  });

  it('devuelve el resultado real cuando VITE_USE_MOCKS=false y la API responde', async () => {
    const { withMockFallback } = await loadClient(false);

    await expect(withMockFallback('real', async () => ['real'], ['local'])).resolves.toEqual(['real']);
  });
});
