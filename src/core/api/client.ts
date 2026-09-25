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

/** La petición no recibió respuesta dentro del límite de tiempo. */
export class ApiTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(
      `La solicitud tardó más de ${Math.round(timeoutMs / 1000)} s en responder. ` +
        'Verifica tu conexión e inténtalo de nuevo.',
    );
    this.name = 'ApiTimeoutError';
  }
}

/** Límite por defecto para peticiones a la API (ms). */
export const DEFAULT_API_TIMEOUT_MS = 20_000;

/** Límite para descargas/generación de archivos (PDF/CSV/GeoJSON). */
export const DOWNLOAD_API_TIMEOUT_MS = 120_000;

/** Opciones comunes de las peticiones a la API. */
export interface ApiRequestOptions {
  /** Cancela la petición (p. ej. al desmontar el componente). */
  signal?: AbortSignal;
  /** Cabeceras extra. */
  headers?: Record<string, string>;
  /**
   * Límite de tiempo en ms. `0` o negativo desactiva el límite, para
   * operaciones sincrónicas largas (benchmarks, seed de admin, exports).
   */
  timeoutMs?: number;
}

/**
 * Envuelve `fetch` con un límite de tiempo: si el backend no responde dentro de
 * `timeoutMs`, aborta la petición y lanza `ApiTimeoutError`. Evita que una caída
 * transitoria del servidor deje la UI cargando de forma indefinida.
 *
 * Un `signal` externo (p. ej. cancelación del llamador) sigue respetándose y se
 * propaga como el error original, sin confundirse con el timeout.
 */
async function fetchWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(resolveUrl(path), init);
  }
  const controller = new AbortController();
  const external = init.signal ?? null;
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    return await fetch(resolveUrl(path), { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
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
        const res = await fetchWithTimeout('/api/v1/auth/refresh', {
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

async function fetchWithAuthRetry(
  path: string,
  init: RequestInit,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
  retried = false,
): Promise<Response> {
  const res = await fetchWithTimeout(path, { ...init, credentials: 'include' }, timeoutMs);
  if (res.status === 401 && !retried && (await tryRefreshToken())) {
    return fetchWithAuthRetry(path, init, timeoutMs, true);
  }
  return res;
}

export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const res = await fetchWithAuthRetry(
    path,
    {
      headers: { ...authHeaders(), ...(options?.headers ?? {}) },
      signal: options?.signal,
    },
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const res = await fetchWithAuthRetry(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options?.headers ?? {}) },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const res = await fetchWithTimeout(
    path,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options?.headers ?? {}) },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: options?.signal,
    },
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const res = await fetchWithTimeout(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options?.headers ?? {}) },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: options?.signal,
    },
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const res = await fetchWithTimeout(
    path,
    {
      method: 'DELETE',
      headers: { ...authHeaders(), ...(options?.headers ?? {}) },
      credentials: 'include',
      signal: options?.signal,
    },
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  await ensureOk(res);
  return res.json() as Promise<T>;
}

export async function apiDownload(
  path: string,
  filename: string,
  options?: ApiRequestOptions,
): Promise<void> {
  const res = await fetchWithTimeout(
    path,
    {
      headers: { ...authHeaders(), ...(options?.headers ?? {}) },
      credentials: 'include',
      signal: options?.signal,
    },
    options?.timeoutMs ?? DOWNLOAD_API_TIMEOUT_MS,
  );
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
