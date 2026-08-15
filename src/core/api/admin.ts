import type { UserRole } from '../types/auth';
import { apiGet, apiPatch, apiPost } from './client';

export interface AdminRole {
  id: UserRole;
  label: string;
  description: string;
}

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  roleLabel: string;
  sectorId?: number | null;
  sectorName?: string | null;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

export interface AdminUserCreate {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  sectorId?: number | null;
  active?: boolean;
}

export interface AdminUserUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role?: UserRole;
  sectorId?: number | null;
  active?: boolean;
  password?: string;
}

export interface OperationalSettings {
  systemName: string;
  language: string;
  timezone: string;
  dateFormat: string;
  refreshSeconds: number;
  maxLoadTons: number;
  idleMinutes: number;
  defaultSpeedKmh: number;
  maxAssignDistanceKm: number;
  autoRecalcRoutes: boolean;
  distanceUnit: string;
  volumeUnit: string;
  weightUnit: string;
  timeUnit: string;
  fillThresholdPct: number;
  depotLat: number;
  depotLon: number;
  landfillLat: number;
  landfillLon: number;
  landfillUnloadMinutes: number;
  workStart: string;
  workEnd: string;
  sessionTimeoutMinutes: number;
}

export type OperationalSettingsUpdate = Partial<OperationalSettings>;

export interface AuditLogEntry {
  id: number;
  actorEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export function fetchAdminRoles(): Promise<AdminRole[]> {
  return apiGet<AdminRole[]>('/api/v1/admin/roles');
}

export function fetchAdminUsers(): Promise<AdminUser[]> {
  return apiGet<AdminUser[]>('/api/v1/admin/users');
}

export function createAdminUser(payload: AdminUserCreate): Promise<AdminUser> {
  return apiPost<AdminUser>('/api/v1/admin/users', payload);
}

export function updateAdminUser(userId: number, payload: AdminUserUpdate): Promise<AdminUser> {
  return apiPatch<AdminUser>(`/api/v1/admin/users/${userId}`, payload);
}

export function fetchAdminSettings(): Promise<OperationalSettings> {
  return apiGet<OperationalSettings>('/api/v1/admin/settings');
}

export function updateAdminSettings(payload: OperationalSettingsUpdate): Promise<OperationalSettings> {
  return apiPatch<OperationalSettings>('/api/v1/admin/settings', payload);
}

export function fetchAdminAuditLog(limit = 50): Promise<AuditLogEntry[]> {
  return apiGet<AuditLogEntry[]>(`/api/v1/admin/audit-log?limit=${limit}`);
}

export interface SeedResult {
  parishes: number;
  sectors: number;
  collectionPoints: number;
  vehicles: number;
  drivers: number;
  users: number;
  optimizedRoutes: number;
  simulations: number;
  systemAlerts: number;
  demoPassword: string;
}

export function runAdminSeed(): Promise<SeedResult> {
  return apiPost<SeedResult>('/api/v1/admin/seed', {});
}
