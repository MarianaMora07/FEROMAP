/**
 * Campos de configuración operativa relacionados con instalaciones (ADR-004).
 * @see docs/fase-9/adr-vertedero-multi-viaje.md
 */

export type {
  OperationalFacilitiesFields,
  LandfillDurationBreakdown,
  LandfillRouteBreakdown,
} from './landfillServiceTime';

export {
  DEFAULT_DEPOT_LAT,
  DEFAULT_DEPOT_LON,
  DEFAULT_LANDFILL_LAT,
  DEFAULT_LANDFILL_LON,
  DEFAULT_LANDFILL_UNLOAD_MINUTES,
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
} from './landfillServiceTime';

import type { OperationalSettings } from '../api/admin';

/** Subconjunto de settings admin para depósito, vertedero y jornada. */
export type OperationalFacilitiesSettings = Pick<
  OperationalSettings,
  | 'depotLat'
  | 'depotLon'
  | 'landfillLat'
  | 'landfillLon'
  | 'landfillUnloadMinutes'
  | 'workStart'
  | 'workEnd'
>;

export const DEFAULT_OPERATIONAL_FACILITIES: OperationalFacilitiesSettings = {
  depotLat: 8.295,
  depotLon: -62.715,
  landfillLat: 8.28,
  landfillLon: -62.69,
  landfillUnloadMinutes: 15,
  workStart: '06:00',
  workEnd: '18:00',
};
