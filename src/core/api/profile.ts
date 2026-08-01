import { apiGet, apiPatch } from './client';

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
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export function fetchProfile(): Promise<ProfileDetail> {
  return apiGet<ProfileDetail>('/api/v1/profile/me');
}

export function updateProfile(payload: ProfileUpdate): Promise<ProfileDetail> {
  return apiPatch<ProfileDetail>('/api/v1/profile/me', payload);
}
