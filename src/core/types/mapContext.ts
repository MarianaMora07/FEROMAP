import type { ContainerCollection, RouteCollection } from './geo';
import type { LiveVehicle } from '../api/monitoring';

export interface MapMetric {
  id: string;
  label: string;
  value: number;
  tone: 'green' | 'red' | 'amber' | 'blue';
  icon: 'trash' | 'truck' | 'route';
}

export interface LiveActivity {
  id: string;
  time: string;
  text: string;
  tone: 'success' | 'info' | 'warning' | 'danger' | 'default';
}

import type { MapFacilities } from '../utils/landfillUx';

export interface MapOperationalContext {
  vehicles: LiveVehicle[];
  routes: RouteCollection;
  containers: ContainerCollection;
  mapMetrics: MapMetric[];
  liveActivities: LiveActivity[];
  updatedAt: string;
  facilities?: MapFacilities;
}

export interface MapContextFilters {
  sector?: string;
  bbox?: string;
  dailyPlanId?: number;
  /** Incluye `stops`, `totalDurationMinutes` y `startTime` en propiedades de ruta. */
  playbackDetails?: boolean;
}
