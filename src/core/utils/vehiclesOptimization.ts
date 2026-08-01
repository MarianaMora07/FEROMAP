import type { Vehicle } from '../../data/mock/vehicles';
import { isAssignableVehicle } from '../api/vehicles';

export interface VehicleOptimizationContext {
  lastOptimizedCodes: string[];
  lastOptimizedAt: string | null;
}

export function enrichVehiclesWithOptimization(
  vehicles: Vehicle[],
  context: VehicleOptimizationContext,
): Vehicle[] {
  const lastOptimized = new Set(context.lastOptimizedCodes);
  return vehicles.map((vehicle) => ({
    ...vehicle,
    usedInLastOptimization: lastOptimized.has(vehicle.id),
  }));
}

export function buildMockVehiclesOptimizationContext(vehicles: Vehicle[]): VehicleOptimizationContext {
  const fallbackCodes = vehicles
    .filter((vehicle) => isAssignableVehicle(vehicle.status))
    .slice(0, 4)
    .map((vehicle) => vehicle.id);

  return {
    lastOptimizedCodes: fallbackCodes,
    lastOptimizedAt: null,
  };
}

export function buildVehicleMapHref(vehicleId: string): string {
  return `/map?vehicle=${encodeURIComponent(vehicleId)}`;
}
