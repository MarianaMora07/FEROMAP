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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const json = JSON.parse(message) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const json = JSON.parse(message) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const json = JSON.parse(message) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const json = JSON.parse(message) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(resolveUrl(path), {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const json = JSON.parse(message) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(message, res.status);
  }
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
