import type { AuthUser } from '../types/auth';
import type { LiveVehicle } from '../api/monitoring';
import { matchOperatorVehicle } from './operatorUx';

/** Flota reducida al vehículo del conductor (o uno activo en demo/mock). */
export function fleetForOperatorField(
  fleet: LiveVehicle[],
  user: AuthUser | null | undefined,
): LiveVehicle[] {
  const matched = matchOperatorVehicle(fleet, user);
  if (matched) return [matched];

  const active = fleet.filter((vehicle) => vehicle.status === 'en-ruta');
  if (active.length === 1) return active;
  if (active.length > 0) return [active[0]!];

  return fleet.length > 0 ? [fleet[0]!] : [];
}

export function resolveOperatorVehicleId(
  fleet: LiveVehicle[],
  user: AuthUser | null | undefined,
): string | null {
  return fleetForOperatorField(fleet, user)[0]?.id ?? null;
}
