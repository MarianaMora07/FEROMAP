import { createStore } from 'solid-js/store';
import { fetchCurrentUser, loginRequest, logoutRequest } from '../api/auth';
import { homePathForRole } from '../auth/permissions';
import { setAuthToken } from '../api/client';
import type { AuthUser, UserRole } from '../types/auth';
import { ROLE_LABELS } from '../types/auth';

const TOKEN_KEY = 'feromap.auth.token';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

const [state, setState] = createStore<AuthState>({
  token: null,
  user: null,
  loading: false,
  initialized: false,
  error: null,
});

function persistToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  setAuthToken(token);
}

export async function initAuth(): Promise<void> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) {
    setState({ initialized: true, token: null, user: null });
    return;
  }

  setState('loading', true);
  setAuthToken(stored);
  try {
    const user = await fetchCurrentUser();
    setState({ token: stored, user, initialized: true, error: null });
  } catch {
    persistToken(null);
    setState({ token: null, user: null, initialized: true, error: null });
  } finally {
    setState('loading', false);
  }
}

export async function login(email: string, password: string): Promise<string> {
  setState({ loading: true, error: null });
  try {
    const response = await loginRequest(email, password);
    persistToken(response.accessToken);
    setState({ token: response.accessToken, user: response.user, error: null });
    return homePathForRole(response.user.role);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión';
    setState({ error: message });
    throw error;
  } finally {
    setState('loading', false);
  }
}

export async function logout(): Promise<void> {
  await logoutRequest();
  persistToken(null);
  setState({ token: null, user: null, error: null });
}

export function authUser() {
  return state.user;
}

export function authToken() {
  return state.token;
}

export function authLoading() {
  return state.loading;
}

export function authInitialized() {
  return state.initialized;
}

export function authError() {
  return state.error;
}

export function isAuthenticated() {
  return Boolean(state.token && state.user);
}

export function userDisplayName() {
  const user = state.user;
  if (!user) return '';
  return `${user.firstName} ${user.lastName}`;
}

export function userRoleLabel() {
  const user = state.user;
  if (!user) return '';
  return ROLE_LABELS[user.role as UserRole] ?? user.role;
}

export function userInitials() {
  const user = state.user;
  if (!user) return '??';
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
}

export { state as authState };
