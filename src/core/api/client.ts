import { notifyMockFallback } from './mockFallback';

export const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

/** En dev las peticiones van por el proxy de Vite (`/api` → backend) y evitan CORS. */
const apiBase = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  : '';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

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

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function readErrorMessage(res: Response): Promise<string> {
  let message = await res.text();
  try {
    const json = JSON.parse(message) as { detail?: string };
    if (typeof json.detail === 'string') message = json.detail;
  } catch {
    // keep raw text
  }
  return message;
}

/** Reporta fallos del servidor/red a la superficie global (carga diferida). */
function reportApiFailure(status: number, message: string): void {
  void import('../errors/errorReporter').then((mod) => mod.reportApiFailure(status, message));
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const message = await readErrorMessage(res);
  reportApiFailure(res.status, message);
  throw new ApiError(message, res.status);
}

/** Refresca el access token vía cookie de refresh (evita corte a 60 min en ruta). */
let refreshPromise: Promise<boolean> | null = null;
async function tryRefreshToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(resolveUrl('/api/v1/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken?: string };
        if (data.accessToken) {
          setAuthToken(data.accessToken);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        // Permite reintentos en la siguiente expiración.
        setTimeout(() => {
          refreshPromise = null;
        }, 1000);
      }
    })();
  }
  return refreshPromise;
}

async function fetchWithAuthRetry(path: string, init: RequestInit, retried = false): Promise<Response> {
  const res = await fetch(resolveUrl(path), { ...init, credentials: 'include' });
  if (res.status === 401 && !retried && (await tryRefreshToken())) {
    return fetchWithAuthRetry(path, init, true);
  }
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithAuthRetry(path, {
    headers: authHeaders(),
  });
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetchWithAuthRetry(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options?.headers ?? {}) },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(resolveUrl(path), {
    headers: authHeaders(),
    credentials: 'include',
  });
  await ensureOk(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function withMockFallback<T>(
  label: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (useMocks) {
    notifyMockFallback(label);
    return fallback;
  }

  // Sin mocks: un error de API debe propagarse. Disfrazarlo con datos locales
  // haría pasar por reales datos que no lo son (ver docs/estado-modulos.md, F1).
  return fetcher();
}
