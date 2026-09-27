import type { DaySimulation } from '../../core/api/daySimulation';
import { mockDailyRoutePlayback } from './routePlayback';

/**
 * Secuencia guionada de demo (~5 min): avería del camión más cargado y contenedor
 * crítico. Reutiliza las rutas del mock de playback para que sea coherente.
 */
export function mockDaySimulation(dailyPlanId: number): DaySimulation {
  const routes = mockDailyRoutePlayback(dailyPlanId).routes;
  const baseRoutes = routes.length > 0 ? routes : [];
  const firstRoute = baseRoutes[0]!;
  const secondRoute = (baseRoutes[1] ?? firstRoute)!;

  const baseStops = baseRoutes.reduce((sum, route) => sum + route.stops.length, 0);
  const chainedStops = secondRoute.stops.length;

  // Camión de reserva que absorbe los puntos liberados (espejo del backend real,
  // que reasigna la avería a la flota disponible fuera del plan base).
  const spareRoute = {
    ...secondRoute,
    routeId: 11,
    vehicleId: 11,
    vehicleLabel: 'TR-11',
    color: '#7c3aed',
  };

  return {
    dailyPlanId,
    operationDate: '2026-09-14',
    operationMinutes: 480,
    playbackDurationMinutes: 5,
    baseRoutes,
    steps: [
      {
        id: 'step-1-breakdown',
        atMinutes: 168,
        type: 'breakdown',
        target: { vehicleId: firstRoute.vehicleLabel },
        alternativeRoutes: [spareRoute],
        resolution: 'reassigned',
        droppedPoints: [],
        droppedDetails: [],
        reassignedPoints: 3,
        beforeDistanceKm: 42.5,
        afterDistanceKm: 45.1,
        distanceDeltaKm: 2.6,
        baseStops,
        stabilityPct: Math.round(100 * (1 - 3 / Math.max(1, baseStops)) * 10) / 10,
        message: `Simulación de avería en ${firstRoute.vehicleLabel}: puntos reasignados a la flota disponible.`,
      },
      {
        id: 'step-2-critical',
        atMinutes: 336,
        type: 'critical_container',
        target: { pointCode: 'CNT-010' },
        alternativeRoutes: [secondRoute, spareRoute],
        resolution: 'pending',
        droppedPoints: ['CNT-010'],
        droppedDetails: [{ code: 'CNT-010', fillPct: 92, criticality: 'critico', priority: 165 }],
        reassignedPoints: 1,
        beforeDistanceKm: null,
        afterDistanceKm: 40.0,
        distanceDeltaKm: null,
        baseStops: chainedStops,
        stabilityPct: null,
        message: 'Simulación: un punto quedaría sin atender por falta de capacidad.',
      },
    ],
  };
}
