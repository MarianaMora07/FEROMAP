export type VehicleStatus = 'en-ruta' | 'disponible' | 'mantenimiento' | 'fuera-de-servicio';
export type VehicleType = 'Compactador' | 'Volteo' | 'Recolector';

export interface Vehicle {
  id: string;
  type: VehicleType;
  plate: string;
  status: VehicleStatus;
  driver: string;
  driverPhone?: string;
  defaultDriverId?: number | null;
  driverId?: number | null;
  fuelPct: number | null;
  fuelLiters?: number;
  capacityPct: number | null;
  capacityM3: number;
  maxCapacityKg?: number;
  idealOperatorsCount?: number;
  assignedOperatorsCount?: number | null;
  effectiveAssignedOperatorsCount?: number;
  model: string;
  year: number;
  mileageKm: number;
  base: string;
  currentRoute?: string;
  updatedAt: string;
  image: string;
  usedInLastOptimization?: boolean;
}

export const vehicleDetailTabs = [
  { id: 'info', label: 'Información' },
  { id: 'maintenance', label: 'Mantenimiento' },
  { id: 'history', label: 'Historial' },
  { id: 'docs', label: 'Documentos' },
] as const;

export type VehicleDetailTabId = (typeof vehicleDetailTabs)[number]['id'];
