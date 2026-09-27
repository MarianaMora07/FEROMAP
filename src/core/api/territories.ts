import { apiGet, apiPut } from './client';

export interface SectorTerritoryRow {
  sectorId: number;
  name: string;
  pointCount: number;
  driverId?: number | null;
  driverName?: string | null;
}

export interface DriverTerritoryResult {
  driverId: number;
  assignedSectorIds: number[];
  count: number;
}

/** Sectores con contenedores activos y su conductor de preferencia actual. */
export async function fetchSectorTerritories(): Promise<SectorTerritoryRow[]> {
  const payload = await apiGet<{ sectors: SectorTerritoryRow[] }>('/api/v1/drivers/territories');
  return payload.sectors ?? [];
}

/** Reemplaza los sectores de preferencia (territorio) de un conductor. */
export async function setDriverTerritory(
  driverId: number,
  sectorIds: number[],
): Promise<DriverTerritoryResult> {
  return apiPut<DriverTerritoryResult>(`/api/v1/drivers/${driverId}/territory`, {
    sectorIds,
  });
}
