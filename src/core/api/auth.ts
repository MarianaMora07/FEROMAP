import type { AuthUser } from '../types/auth';
import { apiGet, apiPost, setAuthToken } from './client';

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const response = await apiPost<LoginResponse>('/api/v1/auth/login', { email, password });
  setAuthToken(response.accessToken);
  return response;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return apiGet<AuthUser>('/api/v1/auth/me');
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiPost('/api/v1/auth/logout', {});
  } catch {
    // ignore network errors on logout
  }
  setAuthToken(null);
}
