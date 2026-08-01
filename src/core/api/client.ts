export const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

/** En dev las peticiones van por el proxy de Vite (`/api` → backend) y evitan CORS. */
const apiBase = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  : '';

export function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (apiBase) return `${apiBase}${path}`;
  return path;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(resolveUrl(path));
  if (!res.ok) {
    throw new ApiError(await res.text(), res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(await res.text(), res.status);
  }
  return res.json() as Promise<T>;
}

export async function withMockFallback<T>(
  label: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (useMocks) return fallback;

  try {
    return await fetcher();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[FEROMAP] API falló (${label}); usando mock.`, error);
    }
    return fallback;
  }
}
