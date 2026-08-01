import { vehiclesList, type Vehicle, type VehicleStatus } from '../../data/mock/vehicles';
import { apiGet, withMockFallback } from './client';

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=480&h=320&q=80';

const VEHICLE_TYPES = ['Compactador', 'Volteo', 'Recolector'] as const;

export interface ApiVehicle {
  id: string;
  plate: string;
  status: VehicleStatus;
  maxCapacityKg: number;
  fuelConsumptionRate: number;
  driver: string | null;
  driverPhone: string | null;
  type?: string;
  fuelPct?: number;
  capacityPct?: number;
  capacityM3?: number;
  model?: string;
  year?: number;
  mileageKm?: number;
  base?: string;
  updatedAt?: string;
  image?: string;
  idealOperatorsCount?: number;
}

function mapApiVehicle(row: ApiVehicle, index: number): Vehicle {
  return {
    id: row.id,
    type: row.type ?? VEHICLE_TYPES[index % VEHICLE_TYPES.length],
    plate: row.plate,
    status: row.status,
    driver: row.driver ?? '—',
    driverPhone: row.driverPhone ?? undefined,
    fuelPct: row.fuelPct ?? Math.max(25, 100 - index * 7),
    capacityPct: row.capacityPct ?? Math.min(95, 15 + index * 8),
    capacityM3: row.capacityM3 ?? row.maxCapacityKg / 1000,
    model: row.model ?? 'Camión de recolección',
    year: row.year ?? 2022,
    mileageKm: row.mileageKm ?? 12000 + index * 1500,
    base: row.base ?? 'Base Unare',
    updatedAt: row.updatedAt ?? new Date().toLocaleString('es-VE'),
    image: row.image ?? DEFAULT_IMAGE,
  };
}

export function fetchVehicles(): Promise<Vehicle[]> {
  return withMockFallback(
    'vehicles',
    async () => {
      const rows = await apiGet<ApiVehicle[]>('/api/v1/vehicles');
      return rows.map(mapApiVehicle);
    },
    vehiclesList,
  );
}

export function computeVehiclesKpis(vehicles: Vehicle[]) {
  const total = vehicles.length;
  const active = vehicles.filter((v) => v.status === 'en-ruta' || v.status === 'disponible').length;
  const maintenance = vehicles.filter((v) => v.status === 'mantenimiento').length;
  const outOfService = vehicles.filter((v) => v.status === 'fuera-de-servicio').length;

  return [
    {
      id: 'total',
      title: 'Total de vehículos',
      value: total,
      unit: 'unidades',
      iconTone: 'blue' as const,
      icon: 'truck' as const,
    },
    {
      id: 'maintenance',
      title: 'En mantenimiento',
      value: maintenance,
      unit: 'unidades',
      iconTone: 'amber' as const,
      icon: 'wrench' as const,
    },
    {
      id: 'out',
      title: 'Fuera de servicio',
      value: outOfService,
      unit: 'unidades',
      iconTone: 'red' as const,
      icon: 'flag' as const,
    },
    {
      id: 'active',
      title: 'Activos',
      value: active,
      unit: 'unidades',
      iconTone: 'green' as const,
      icon: 'truck' as const,
    },
  ];
}
