import type { Vehicle, VehicleStatus } from '../types/vehicle';
import { downloadCsvContent } from './collectionPointsUtils';

const EXPORT_STATUS_LABELS: Record<VehicleStatus, string> = {
  disponible: 'Disponible',
  'en-ruta': 'En ruta',
  mantenimiento: 'Mantenimiento',
  'fuera-de-servicio': 'Fuera de servicio',
};

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildVehiclesCsv(vehicles: Vehicle[]): string {
  const headers = [
    'ID',
    'Placa',
    'Estado',
    'Tipo',
    'Conductor',
    'Teléfono conductor',
    'Capacidad máx. (kg)',
    'Ruta actual',
    'Última actualización',
  ];
  const rows = vehicles.map((vehicle) => [
    vehicle.id,
    vehicle.plate,
    EXPORT_STATUS_LABELS[vehicle.status],
    vehicle.type,
    vehicle.driver,
    vehicle.driverPhone ?? '',
    vehicle.maxCapacityKg ?? Math.round(vehicle.capacityM3 * 1000),
    vehicle.currentRoute ?? '',
    vehicle.updatedAt,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
}

export function downloadVehiclesCsv(
  vehicles: Vehicle[],
  filename = 'feromap-vehiculos.csv',
): void {
  downloadCsvContent(buildVehiclesCsv(vehicles), filename);
}

export function buildVehiclesExportFilename(filters: {
  status?: string;
  assignableOnly?: boolean;
  search?: string;
}): string {
  const parts = [
    filters.status || 'todos-estados',
    filters.assignableOnly ? 'asignables' : 'toda-flota',
    filters.search?.trim() ? 'busqueda' : null,
  ].filter(Boolean);
  return `feromap-vehiculos-${parts.join('-')}.csv`;
}
