import { apiDelete, apiGet, apiPatch, apiPost, resolveUrl, getAuthToken } from './client';

export interface ProfilePreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  units: 'metric' | 'imperial';
  defaultView: string;
  reportFrequency: string;
  pageSize: number;
  emailNotifications: boolean;
  systemNotifications: boolean;
  address?: string | null;
  timezone: string;
}

export interface ProfileSecuritySummary {
  activeSessions: number;
  twoFactorEnabled: boolean;
}

export interface ProfileDetail {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  roleLabel: string;
  sectorId?: number | null;
  sectorName?: string | null;
  active: boolean;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  lastIpAddress?: string | null;
  preferences: ProfilePreferences;
  security: ProfileSecuritySummary;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface ProfilePreferencesUpdate {
  theme?: ProfilePreferences['theme'];
  language?: string;
  units?: ProfilePreferences['units'];
  defaultView?: string;
  reportFrequency?: string;
  pageSize?: number;
  emailNotifications?: boolean;
  systemNotifications?: boolean;
  address?: string | null;
  timezone?: string;
}

export interface ProfileSession {
  id: string;
  deviceLabel: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export function resolveAvatarUrl(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
  return resolveUrl(avatarUrl);
}

export function fetchProfile(): Promise<ProfileDetail> {
  return apiGet<ProfileDetail>('/api/v1/profile/me');
}

export function updateProfile(payload: ProfileUpdate): Promise<ProfileDetail> {
  return apiPatch<ProfileDetail>('/api/v1/profile/me', payload);
}

export function updateProfilePreferences(
  payload: ProfilePreferencesUpdate,
): Promise<ProfilePreferences> {
  return apiPatch<ProfilePreferences>('/api/v1/profile/preferences', payload);
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>('/api/v1/profile/change-password', {
    currentPassword,
    newPassword,
  });
}

export function fetchProfileSessions(): Promise<ProfileSession[]> {
  return apiGet<ProfileSession[]>('/api/v1/profile/sessions');
}

export function deleteProfileSession(
  sessionId: string,
): Promise<{ ok: boolean; currentSessionRevoked?: boolean }> {
  return apiDelete<{ ok: boolean; currentSessionRevoked?: boolean }>(
    `/api/v1/profile/sessions/${sessionId}`,
  );
}

export async function uploadProfileAvatar(file: File): Promise<ProfileDetail> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveUrl('/api/v1/profile/avatar'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'No se pudo subir el avatar');
  }
  return res.json() as Promise<ProfileDetail>;
}
