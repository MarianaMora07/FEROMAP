import { vehiclesList } from '../../data/mock/vehicles';
import type { Vehicle, VehicleStatus } from '../types/vehicle';
import {
  buildMockVehiclesOptimizationContext,
  enrichVehiclesWithOptimization,
  type VehicleOptimizationContext,
} from '../utils/vehiclesOptimization';
import { apiDownload, apiGet, apiPatch, withMockFallback } from './client';

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
  defaultDriverId?: number | null;
  driverId?: number | null;
  type?: string;
  fuelPct?: number | null;
  capacityPct?: number | null;
  capacityM3?: number;
  model?: string;
  year?: number;
  mileageKm?: number;
  base?: string;
  updatedAt?: string;
  image?: string;
  idealOperatorsCount?: number;
  assignedOperatorsCount?: number | null;
  effectiveAssignedOperatorsCount?: number;
  currentRoute?: string | null;
  activeRouteId?: number;
}

export interface VehiclesSummary {
  total: number;
  assignableCount: number;
  byStatus: Record<VehicleStatus, number>;
}

export interface VehicleKpi {
  id: string;
  title: string;
  value: number;
  unit: string;
  iconTone: 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'slate';
  icon: 'truck' | 'wrench' | 'flag';
  highlight?: boolean;
}

export function isAssignableVehicle(status: VehicleStatus): boolean {
  return status === 'disponible' || status === 'en-ruta';
}

export function countAssignableVehicles(vehicles: Vehicle[]): number {
  return vehicles.filter((vehicle) => isAssignableVehicle(vehicle.status)).length;
}

export function hasAssignedDriver(vehicle: Vehicle): boolean {
  if (vehicle.defaultDriverId != null || vehicle.driverId != null) return true;
  const driver = vehicle.driver?.trim();
  return !!driver && driver !== '—' && driver !== '-';
}

/** Listos para optimizar: estado asignable + conductor (igual que el motor VRP). */
export function countSimulationReadyVehicles(vehicles: Vehicle[]): number {
  return vehicles.filter(
    (vehicle) => isAssignableVehicle(vehicle.status) && hasAssignedDriver(vehicle),
  ).length;
}

function normalizeVehicle(vehicle: Vehicle): Vehicle & { maxCapacityKg: number } {
  return {
    ...vehicle,
    maxCapacityKg: vehicle.maxCapacityKg ?? Math.round(vehicle.capacityM3 * 1000),
  };
}

function mapApiVehicle(row: ApiVehicle, index: number): Vehicle {
  const capacityM3 = row.capacityM3 ?? row.maxCapacityKg / 1000;
  return normalizeVehicle({
    id: row.id,
    type: (row.type ?? VEHICLE_TYPES[index % VEHICLE_TYPES.length]) as Vehicle['type'],
    plate: row.plate,
    status: row.status,
    driver: row.driver ?? '—',
    driverPhone: row.driverPhone ?? undefined,
    defaultDriverId: row.defaultDriverId ?? null,
    driverId: row.driverId ?? null,
    fuelPct: row.fuelPct ?? null,
    capacityPct: row.capacityPct ?? null,
    capacityM3,
    maxCapacityKg: row.maxCapacityKg,
    model: row.model ?? 'Camión de recolección',
    year: row.year ?? 2022,
    mileageKm: row.mileageKm ?? 12000 + index * 1500,
    base: row.base ?? 'Base Unare',
    currentRoute: row.currentRoute ?? undefined,
    updatedAt: row.updatedAt ?? new Date().toLocaleString('es-VE'),
    image: row.image ?? DEFAULT_IMAGE,
    idealOperatorsCount: row.idealOperatorsCount ?? 6,
    assignedOperatorsCount: row.assignedOperatorsCount ?? null,
    effectiveAssignedOperatorsCount:
      row.effectiveAssignedOperatorsCount ??
      row.assignedOperatorsCount ??
      row.idealOperatorsCount ??
      6,
  });
}

export function fetchVehicles(): Promise<(Vehicle & { maxCapacityKg: number })[]> {
  return withMockFallback(
    'vehicles',
    async () => {
      const rows = await apiGet<ApiVehicle[]>('/api/v1/vehicles');
      return rows.map(mapApiVehicle);
    },
    vehiclesList.map(normalizeVehicle),
  );
}

function buildMockSummary(): VehiclesSummary {
  const byStatus: Record<VehicleStatus, number> = {
    disponible: 0,
    'en-ruta': 0,
    mantenimiento: 0,
    'fuera-de-servicio': 0,
  };
  for (const vehicle of vehiclesList) {
    byStatus[vehicle.status] += 1;
  }
  return {
    total: vehiclesList.length,
    assignableCount: countAssignableVehicles(vehiclesList),
    byStatus,
  };
}

export function fetchVehiclesSummary(): Promise<VehiclesSummary> {
  return withMockFallback(
    'vehicles-summary',
    () => apiGet<VehiclesSummary>('/api/v1/vehicles/summary'),
    buildMockSummary,
  );
}

export function fetchVehicleDetail(code: string): Promise<Vehicle & { maxCapacityKg: number }> {
  return withMockFallback(
    `vehicle-detail-${code}`,
    async () => {
      const row = await apiGet<ApiVehicle>(`/api/v1/vehicles/${encodeURIComponent(code)}`);
      return mapApiVehicle(row, 0);
    },
    () => {
      const vehicle = vehiclesList.find((row) => row.id === code);
      if (!vehicle) {
        throw new Error(`Vehículo ${code} no encontrado`);
      }
      return normalizeVehicle(vehicle);
    },
  );
}

function relativePct(count: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

export function computeVehiclesKpisFromSummary(summary: VehiclesSummary): VehicleKpi[] {
  const { total, assignableCount, byStatus } = summary;
  const maintenance = byStatus.mantenimiento ?? 0;
  const outOfService = byStatus['fuera-de-servicio'] ?? 0;

  return [
    {
      id: 'assignable',
      title: 'Disponibles para optimización',
      value: assignableCount,
      unit: relativePct(assignableCount, total),
      iconTone: 'green',
      icon: 'truck',
      highlight: true,
    },
    {
      id: 'total',
      title: 'Total de vehículos',
      value: total,
      unit: 'unidades',
      iconTone: 'blue',
      icon: 'truck',
    },
    {
      id: 'maintenance',
      title: 'En mantenimiento',
      value: maintenance,
      unit: 'unidades',
      iconTone: 'amber',
      icon: 'wrench',
    },
    {
      id: 'out',
      title: 'Fuera de servicio',
      value: outOfService,
      unit: 'unidades',
      iconTone: 'red',
      icon: 'flag',
    },
  ];
}

export function computeVehiclesKpis(vehicles: Vehicle[]): VehicleKpi[] {
  const total = vehicles.length;
  const assignable = countAssignableVehicles(vehicles);
  const maintenance = vehicles.filter((vehicle) => vehicle.status === 'mantenimiento').length;
  const outOfService = vehicles.filter((vehicle) => vehicle.status === 'fuera-de-servicio').length;

  return computeVehiclesKpisFromSummary({
    total,
    assignableCount: assignable,
    byStatus: {
      disponible: vehicles.filter((vehicle) => vehicle.status === 'disponible').length,
      'en-ruta': vehicles.filter((vehicle) => vehicle.status === 'en-ruta').length,
      mantenimiento: maintenance,
      'fuera-de-servicio': outOfService,
    },
  });
}

export function formatCapacityKg(value: number): string {
  return `${value.toLocaleString('es-VE')} kg`;
}

export type VehicleStatusUpdate = 'available' | 'maintenance';

export interface VehicleUpdatePayload {
  status?: VehicleStatusUpdate;
  defaultDriverId?: number | null;
  assignedOperatorsCount?: number | null;
}

export function formatCrewAssignmentLabel(
  vehicle: Pick<Vehicle, 'idealOperatorsCount' | 'assignedOperatorsCount' | 'effectiveAssignedOperatorsCount'>,
): string {
  const ideal = vehicle.idealOperatorsCount ?? 6;
  const effective = vehicle.effectiveAssignedOperatorsCount ?? vehicle.assignedOperatorsCount ?? ideal;
  const fieldOps = Math.max(0, effective - 1);
  return `${effective}/${ideal} (conductor + ${fieldOps} operarios)`;
}

export function updateVehicleStatus(
  code: string,
  status: VehicleStatusUpdate,
): Promise<Vehicle & { maxCapacityKg: number }> {
  return updateVehicle(code, { status });
}

export function updateVehicle(
  code: string,
  payload: VehicleUpdatePayload,
): Promise<Vehicle & { maxCapacityKg: number }> {
  return apiPatch<ApiVehicle>(`/api/v1/vehicles/${encodeURIComponent(code)}`, payload).then((row) =>
    mapApiVehicle(row, 0),
  );
}

export function fetchVehiclesOptimizationContext(
  vehicles: Vehicle[] = [],
): Promise<VehicleOptimizationContext> {
  return withMockFallback(
    'vehicles-optimization-context',
    () => apiGet<VehicleOptimizationContext>('/api/v1/vehicles/optimization-context'),
    buildMockVehiclesOptimizationContext(vehicles),
  );
}

export interface VehicleIncident {
  id: number;
  incidentType: string;
  description: string | null;
  reportedAt: string | null;
  resolvedAt: string | null;
  affectsActiveRoute: boolean;
  routeId: number | null;
  status: 'activo' | 'resuelto';
}

const MOCK_VEHICLE_INCIDENTS: Record<string, VehicleIncident[]> = {
  'TR-07': [
    {
      id: 1,
      incidentType: 'scheduled_maintenance',
      description: 'Revisión programada de frenos y sistema hidráulico.',
      reportedAt: '2026-07-20T10:00:00+00:00',
      resolvedAt: null,
      affectsActiveRoute: false,
      routeId: null,
      status: 'activo',
    },
    {
      id: 2,
      incidentType: 'preventive_service',
      description: 'Cambio de aceite y filtros completado.',
      reportedAt: '2026-06-15T14:30:00+00:00',
      resolvedAt: '2026-06-16T09:00:00+00:00',
      affectsActiveRoute: false,
      routeId: null,
      status: 'resuelto',
    },
  ],
  'TR-19': [
    {
      id: 3,
      incidentType: 'breakdown',
      description: 'Falla en transmisión reportada durante ruta.',
      reportedAt: '2026-07-28T16:45:00+00:00',
      resolvedAt: null,
      affectsActiveRoute: true,
      routeId: 12,
      status: 'activo',
    },
  ],
};

export function fetchVehicleIncidents(code: string): Promise<VehicleIncident[]> {
  return withMockFallback(
    `vehicle-incidents-${code}`,
    () => apiGet<VehicleIncident[]>(`/api/v1/vehicles/${encodeURIComponent(code)}/incidents`),
    MOCK_VEHICLE_INCIDENTS[code] ?? [],
  );
}

export interface VehiclesExportFilters {
  status?: string;
  assignableOnly?: boolean;
  q?: string;
}

export function downloadVehiclesExport(
  filters?: VehiclesExportFilters,
  filename = 'feromap-vehiculos.csv',
): Promise<void> {
  const params = new URLSearchParams({ format: 'csv' });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.assignableOnly) params.set('assignable', 'true');
  if (filters?.q?.trim()) params.set('q', filters.q.trim());
  return apiDownload(`/api/v1/vehicles/export?${params.toString()}`, filename);
}

export { enrichVehiclesWithOptimization, type VehicleOptimizationContext };
