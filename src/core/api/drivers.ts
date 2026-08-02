import { driversList } from '../../data/mock/drivers';
import type { Driver, DriverCreate, DriverUpdate } from '../types/driver';
import { apiGet, apiPatch, apiPost, withMockFallback } from './client';

export type { Driver, DriverCreate, DriverUpdate };
export { driverDisplayName } from '../types/driver';

export function fetchDrivers(): Promise<Driver[]> {
  return withMockFallback(
    'drivers',
    () => apiGet<Driver[]>('/api/v1/drivers'),
    () => [...driversList],
  );
}

export function createDriver(payload: DriverCreate): Promise<Driver> {
  return apiPost<Driver>('/api/v1/drivers', payload);
}

export function updateDriver(driverId: number, payload: DriverUpdate): Promise<Driver> {
  return apiPatch<Driver>(`/api/v1/drivers/${driverId}`, payload);
}
