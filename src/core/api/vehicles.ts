import { vehiclesList, type Vehicle, type VehicleStatus } from '../../data/mock/vehicles';
import { apiGet, withMockFallback } from './client';

export interface ApiVehicle {
  id: string;
  plate: string;
  status: VehicleStatus;
  maxCapacityKg: number;
  fuelConsumptionRate: number;
  driver: string | null;
  driverPhone: string | null;
}

function mapApiVehicle(row: ApiVehicle): Vehicle {
  const mock = vehiclesList.find((v) => v.id === row.id);
  if (mock) {
    return {
      ...mock,
      plate: row.plate,
      status: row.status,
      driver: row.driver ?? mock.driver,
      driverPhone: row.driverPhone ?? mock.driverPhone,
    };
  }
  return {
    id: row.id,
    type: 'Compactador',
    plate: row.plate,
    status: row.status,
    driver: row.driver ?? '—',
    driverPhone: row.driverPhone,
    fuelPct: 70,
    capacityPct: 20,
    capacityM3: row.maxCapacityKg / 1000,
    model: 'Camión de recolección',
    year: 2022,
    mileageKm: 0,
    base: 'Base Unare',
    updatedAt: new Date().toLocaleString('es-VE'),
    image: vehiclesList[0]?.image ?? '',
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
