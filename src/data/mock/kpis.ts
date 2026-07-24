import type { Scenario, KpiMetrics, TimelinePoint } from '../types/simulation';

export const scenarios: Scenario[] = [
  {
    id: 'normal',
    label: 'Tráfico normal',
    description: 'Condiciones habituales en horario matutino de recolección.',
    trafficMultiplier: 1,
    fillLevelBoost: 0,
  },
  {
    id: 'peak_traffic',
    label: 'Tráfico pico',
    description: 'Congestión en Av. Guayana y Av. Atlántico durante hora pico.',
    trafficMultiplier: 1.35,
    fillLevelBoost: 5,
  },
  {
    id: 'rain',
    label: 'Lluvia intensa',
    description: 'Velocidad reducida y rutas alternativas por calles inundadas.',
    trafficMultiplier: 1.2,
    fillLevelBoost: 3,
  },
  {
    id: 'saturated',
    label: 'Contenedores saturados',
    description: 'Más del 60% de contenedores superan el 80% de llenado.',
    trafficMultiplier: 1.05,
    fillLevelBoost: 15,
  },
];

export const kpiByScenario: Record<string, KpiMetrics> = {
  normal: {
    distanceKm: { current: 28.4, optimized: 20.1 },
    durationHours: { current: 2.37, optimized: 1.63 },
    fuelLiters: { current: 42.6, optimized: 30.2 },
    co2KgAvoided: 28.4,
    criticalCoveragePct: { current: 62, optimized: 94 },
    containersServed: 20,
  },
  peak_traffic: {
    distanceKm: { current: 28.4, optimized: 19.8 },
    durationHours: { current: 3.18, optimized: 2.05 },
    fuelLiters: { current: 42.6, optimized: 29.7 },
    co2KgAvoided: 31.2,
    criticalCoveragePct: { current: 55, optimized: 91 },
    containersServed: 20,
  },
  rain: {
    distanceKm: { current: 28.4, optimized: 20.5 },
    durationHours: { current: 2.84, optimized: 1.89 },
    fuelLiters: { current: 42.6, optimized: 30.8 },
    co2KgAvoided: 26.8,
    criticalCoveragePct: { current: 58, optimized: 89 },
    containersServed: 20,
  },
  saturated: {
    distanceKm: { current: 28.4, optimized: 17.7 },
    durationHours: { current: 2.49, optimized: 1.48 },
    fuelLiters: { current: 42.6, optimized: 26.6 },
    co2KgAvoided: 35.6,
    criticalCoveragePct: { current: 48, optimized: 97 },
    containersServed: 20,
  },
};

export const timelineMock: TimelinePoint[] = [
  { hour: '05:00', currentKm: 0, optimizedKm: 0 },
  { hour: '06:00', currentKm: 6.2, optimizedKm: 4.1 },
  { hour: '07:00', currentKm: 14.8, optimizedKm: 9.5 },
  { hour: '08:00', currentKm: 22.1, optimizedKm: 15.2 },
  { hour: '09:00', currentKm: 28.4, optimizedKm: 20.1 },
];

export const optimizationLogMessages = [
  { message: 'Inicializando grafo vial de la parroquia Unare…', type: 'info' as const },
  { message: 'Cargando 20 puntos de recolección activos', type: 'info' as const },
  { message: 'Aplicando algoritmo ACO (Colonia de Hormigas)…', type: 'info' as const },
  { message: 'Evaluando 150 soluciones candidatas (VRP dinámico)', type: 'info' as const },
  { message: 'Re-priorizando 6 contenedores críticos (>80% llenado)', type: 'warning' as const },
  { message: 'Optimización convergente en iteración 47', type: 'success' as const },
  { message: 'Ruta optimizada: -29% distancia, -31% tiempo estimado', type: 'success' as const },
];
