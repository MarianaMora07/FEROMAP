import { apiGet, apiPatch } from './client';

export interface ZoneConfig {
  id: number;
  name: string;
  city: string;
  depotLat: number | null;
  depotLon: number | null;
  landfillLat: number | null;
  landfillLon: number | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
}

/** Ajuste parcial: `null` limpia el valor (vuelve a la config global / sin ventana). */
export type ZoneConfigUpdate = Partial<Omit<ZoneConfig, 'id' | 'name' | 'city'>>;

export function fetchZones(): Promise<ZoneConfig[]> {
  return apiGet<ZoneConfig[]>('/api/v1/parishes');
}

export function updateZone(parishId: number, payload: ZoneConfigUpdate): Promise<ZoneConfig> {
  return apiPatch<ZoneConfig>(`/api/v1/parishes/${parishId}/zone`, payload);
}
