import { apiGet, useMocks, withMockFallback } from './client';
import { authUser } from '../stores/authStore';
import { collectionPointsList } from '../../data/mock/collectionPoints';
import { liveFleet } from '../../data/mock/monitoring';

export type OperatorStopStatus = 'pending' | 'visited' | 'omitted';

export interface OperatorRouteStop {
  waypointId: number;
  sequenceOrder: number;
  status: OperatorStopStatus;
  collectionPointId: number | null;
  code: string;
  stopType?: 'collection' | 'landfill';
  sectorName?: string | null;
  address: string;
  notes?: string | null;
  fillLevelPct?: number | null;
  lng?: number | null;
  lat?: number | null;
  estimatedArrivalAt?: string | null;
  actualArrivalAt?: string | null;
}

export interface OperatorRouteSnapshot {
  operationDate: string;
  dailyPlanId: number | null;
  dailyPlanStatus: string | null;
  dailyPlanClosedAt?: string | null;
  routeId: number | null;
  vehicleId: string | null;
  routeLabel: string | null;
  progress: number;
  stopsDone: number;
  stopsTotal: number;
  totalDistanceKm?: number | null;
  traveledDistanceKm?: number | null;
  remainingDistanceKm: number | null;
  nextStop: OperatorRouteStop | null;
  stops: OperatorRouteStop[];
  shiftUtilizationPct?: number | null;
}

function isDemoOperatorClosedDay(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('feromap.demo.operatorClosedDay') === '1';
}

function mockOperatorRouteSnapshot(): OperatorRouteSnapshot {
  const operationDate = new Date().toISOString().slice(0, 10);
  const user = authUser();
  const vehicle =
    liveFleet.find((row) => row.driver === `${user?.firstName ?? 'Juan'} ${user?.lastName ?? 'Pérez'}`) ??
    liveFleet[0];
  const closedDay = isDemoOperatorClosedDay();

  const pointPool = collectionPointsList.slice(0, 8);
  const statuses: OperatorStopStatus[] = closedDay
    ? ['visited', 'visited', 'visited', 'visited', 'visited', 'visited', 'visited', 'omitted']
    : ['visited', 'visited', 'visited', 'visited', 'visited', 'omitted', 'pending', 'pending'];

  const stops: OperatorRouteStop[] = pointPool.map((point, index) => {
    const hour = 7 + index;
    const estimated = `${operationDate}T${String(hour).padStart(2, '0')}:15:00.000Z`;
    const status = statuses[index] ?? 'pending';
    return {
      waypointId: index + 1,
      sequenceOrder: index + 1,
      status,
      collectionPointId: Number.parseInt(point.id, 10) || index + 1,
      code: `CNT-${point.id}`,
      sectorName: point.sector,
      address: point.address,
      notes: `Frecuencia: ${point.frequency}. Llenado ${point.fillLevel}%`,
      fillLevelPct: point.fillLevel,
      lng: point.lng,
      lat: point.lat,
      estimatedArrivalAt: estimated,
      actualArrivalAt: status === 'visited' ? estimated : null,
    };
  });

  const stopsDone = stops.filter((stop) => stop.status === 'visited').length;
  const stopsTotal = stops.length;
  const progress = closedDay ? 100 : (vehicle?.progress ?? Math.round((stopsDone / stopsTotal) * 100));
  const nextStop = closedDay ? null : (stops.find((stop) => stop.status === 'pending') ?? null);
  const totalDistanceKm = 28.6;
  const traveledDistanceKm = closedDay
    ? totalDistanceKm
    : Math.round(totalDistanceKm * (progress / 100) * 10) / 10;

  return {
    operationDate,
    dailyPlanId: 1,
    dailyPlanStatus: closedDay ? 'partial' : 'dispatched',
    dailyPlanClosedAt: closedDay ? `${operationDate}T18:30:00.000Z` : null,
    routeId: vehicle?.routeId ?? 1,
    vehicleId: vehicle?.id ?? 'TR-08',
    routeLabel: vehicle?.route ?? 'Ruta Norte 01',
    progress,
    stopsDone,
    stopsTotal,
    totalDistanceKm,
    traveledDistanceKm,
    remainingDistanceKm: closedDay ? 0 : 12.4,
    nextStop,
    stops,
  };
}

export function fetchOperatorRouteSnapshot(operationDate?: string): Promise<OperatorRouteSnapshot> {
  const query = operationDate ? `?operationDate=${encodeURIComponent(operationDate)}` : '';
  if (useMocks) {
    return Promise.resolve(mockOperatorRouteSnapshot());
  }
  return withMockFallback(
    'operator-route-snapshot',
    () => apiGet<OperatorRouteSnapshot>(`/api/v1/planning/operator-snapshot${query}`),
    mockOperatorRouteSnapshot(),
  );
}

export function operatorStopStatusLabel(status: OperatorStopStatus): string {
  switch (status) {
    case 'visited':
      return 'Visitada';
    case 'omitted':
      return 'Omitida';
    default:
      return 'Pendiente';
  }
}

export function operatorStopStatusVariant(
  status: OperatorStopStatus,
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'visited':
      return 'success';
    case 'omitted':
      return 'warning';
    default:
      return 'default';
  }
}

export function isOperatorLandfillStop(stop: Pick<OperatorRouteStop, 'code' | 'stopType'>): boolean {
  if (stop.stopType === 'landfill') return true;
  return stop.code.toUpperCase() === 'VERTEDERO';
}
