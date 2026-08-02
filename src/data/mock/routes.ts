import type { RouteCollection } from '../../core/types/geo';

/** Orden de paradas; la geometría en pantalla se ajusta a vías con OSRM. */
const currentWaypoints: [number, number][] = [
  [-62.715, 8.295],
  [-62.724, 8.298],
  [-62.733, 8.297],
  [-62.731, 8.291],
  [-62.714, 8.299],
  [-62.711, 8.297],
  [-62.703, 8.298],
  [-62.701, 8.292],
  [-62.704, 8.285],
  [-62.700, 8.282],
  [-62.718, 8.278],
  [-62.706, 8.275],
  [-62.715, 8.295],
];

const optimizedWaypoints: [number, number][] = [
  [-62.715, 8.295],
  [-62.719, 8.294],
  [-62.711, 8.297],
  [-62.714, 8.299],
  [-62.703, 8.298],
  [-62.700, 8.282],
  [-62.706, 8.275],
  [-62.733, 8.297],
  [-62.730, 8.281],
  [-62.710, 8.284],
  [-62.715, 8.295],
];

export const routesMock: RouteCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'route-current',
        type: 'current',
        label: 'Ruta actual (estática)',
        distanceKm: 28.4,
        durationMin: 142,
      },
      geometry: {
        type: 'LineString',
        coordinates: currentWaypoints,
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'route-optimized',
        type: 'optimized',
        label: 'Ruta optimizada (IA)',
        distanceKm: 20.1,
        durationMin: 98,
      },
      geometry: {
        type: 'LineString',
        coordinates: optimizedWaypoints,
      },
    },
  ],
};

export function getScenarioRoutes(scenarioId: string): RouteCollection {
  const multiplier = scenarioId === 'peak_traffic' ? 1.15 : scenarioId === 'rain' ? 1.08 : 1;
  const optimizedBoost = scenarioId === 'saturated' ? 0.92 : 1;

  return {
    type: 'FeatureCollection',
    features: routesMock.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        durationMin: Math.round(
          f.properties.durationMin *
            (f.properties.type === 'current' ? multiplier : multiplier * optimizedBoost)
        ),
        distanceKm:
          f.properties.type === 'optimized' && scenarioId === 'saturated'
            ? Math.round(f.properties.distanceKm * 0.88 * 10) / 10
            : f.properties.distanceKm,
      },
    })),
  };
}
