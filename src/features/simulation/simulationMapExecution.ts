import type { ContainerCollection, RouteCollection } from '../../data/types/geo';
import { routeDisplayKind } from '../../core/map/operationalMapLayers';
import type { ExecutionPhaseId } from './executionPhases';
import {
  getExecutionPhase,
  getPhaseProgressPercent,
  getPhaseStartProgressPercent,
} from './executionPhases';
import {
  interpolateAlongLine,
  sliceLineCoordinates,
} from '../../core/route-playback/routePlaybackGeometry';

export { interpolateAlongLine, sliceLineCoordinates };

export type ExecutionMapLegendId = 'explorando' | 'mejorando' | 'ruta_final';

export const EXECUTION_MAP_LEGEND: {
  id: ExecutionMapLegendId;
  label: string;
  style: 'dashed-amber' | 'dashed-blue' | 'solid-green';
}[] = [
  { id: 'explorando', label: 'Explorando', style: 'dashed-amber' },
  { id: 'mejorando', label: 'Mejorando', style: 'dashed-blue' },
  { id: 'ruta_final', label: 'Ruta final', style: 'solid-green' },
];

export function activeExecutionLegend(phaseId: ExecutionPhaseId | null): ExecutionMapLegendId | null {
  if (!phaseId) return null;
  switch (phaseId) {
    case 'grafo_vial':
    case 'matriz_costos':
    case 'instancia_vrp':
    case 'aco':
      return 'explorando';
    case 'refinamiento_2opt':
      return 'mejorando';
    case 'persistencia':
    case 'preparando_mapa':
    case 'listo':
      return 'ruta_final';
    default:
      return null;
  }
}

export function executionPhaseLocalProgress(
  phaseId: ExecutionPhaseId | null,
  globalPercent: number,
): number {
  if (!phaseId) return 0;
  const start = getPhaseStartProgressPercent(phaseId);
  const end = getPhaseProgressPercent(phaseId);
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (globalPercent - start) / (end - start)));
}

/** Líneas muestra entre contenedores (matriz de costos). */
export function buildCostMatrixFeatures(
  containers: ContainerCollection,
  visibleRatio: number,
): GeoJSON.FeatureCollection {
  const points = containers.features.map((feature) => feature.geometry.coordinates as [number, number]);
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < points.length; i++) {
    const from = points[i]!;
    const to = points[(i + 1) % points.length]!;
    const to2 = points[(i + 2) % points.length]!;
    features.push({
      type: 'Feature',
      properties: { kind: 'cost' },
      geometry: { type: 'LineString', coordinates: [from, to] },
    });
    features.push({
      type: 'Feature',
      properties: { kind: 'cost' },
      geometry: { type: 'LineString', coordinates: [from, to2] },
    });
  }

  const visibleCount = Math.max(1, Math.ceil(features.length * visibleRatio));
  return { type: 'FeatureCollection', features: features.slice(0, visibleCount) };
}

/** Rutas punteadas de exploración (ACO) — variantes ligeramente distintas. */
export function buildExploreRouteFeatures(
  routes: RouteCollection,
  variant: number,
): GeoJSON.FeatureCollection {
  const optimized = routes.features.find((feature) => routeDisplayKind(feature.properties) === 'optimized');
  const current = routes.features.find((feature) => routeDisplayKind(feature.properties) === 'current');
  const base = optimized?.geometry.coordinates ?? current?.geometry.coordinates ?? [];

  if (base.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const jitter = (value: number, index: number) =>
    value + Math.sin(index * 1.7 + variant * 0.9) * 0.0018 * (1 + variant * 0.15);

  const exploreCoords = (base as [number, number][]).map(([lng, lat], index) => [
    jitter(lng, index),
    jitter(lat, index + 3),
  ]) as [number, number][];

  const altCoords = [...exploreCoords].reverse().map(([lng, lat], index) => [
    lng + Math.cos(index + variant) * 0.0012,
    lat - Math.sin(index + variant) * 0.001,
  ]) as [number, number][];

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'explore', variant },
        geometry: { type: 'LineString', coordinates: exploreCoords },
      },
      {
        type: 'Feature',
        properties: { kind: 'explore-alt', variant },
        geometry: { type: 'LineString', coordinates: altCoords },
      },
    ],
  };
}

export function routeFeaturesForExecution(
  routes: RouteCollection,
  phaseId: ExecutionPhaseId | null,
  globalPercent: number,
  exploreVariant: number,
): GeoJSON.Feature[] {
  const current = routes.features.find((feature) => routeDisplayKind(feature.properties) === 'current');
  const optimized = routes.features.find((feature) => routeDisplayKind(feature.properties) === 'optimized');
  const currentCoords = (current?.geometry.coordinates ?? []) as [number, number][];
  const optimizedCoords = (optimized?.geometry.coordinates ?? []) as [number, number][];
  const local = executionPhaseLocalProgress(phaseId, globalPercent);

  if (!phaseId || phaseId === 'preparando') return [];

  if (phaseId === 'refinamiento_2opt' || phaseId === 'persistencia') {
    const features: GeoJSON.Feature[] = [];
    if (currentCoords.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { kind: 'current', ...current?.properties },
        geometry: { type: 'LineString', coordinates: currentCoords },
      });
    }
    if (optimizedCoords.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { kind: 'optimized', ...optimized?.properties },
        geometry: {
          type: 'LineString',
          coordinates: sliceLineCoordinates(optimizedCoords, local),
        },
      });
    }
    return features;
  }

  if (phaseId === 'listo' || phaseId === 'preparando_mapa') {
    return routes.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, kind: feature.properties.type },
    }));
  }

  if (phaseId === 'aco') {
    const explore = buildExploreRouteFeatures(routes, exploreVariant);
    const partial = sliceLineCoordinates(
      (explore.features[0]?.geometry as GeoJSON.LineString).coordinates as [number, number][],
      0.35 + (exploreVariant % 4) * 0.12,
    );
    return [
      {
        type: 'Feature',
        properties: { kind: 'explore' },
        geometry: { type: 'LineString', coordinates: partial },
      },
    ];
  }

  return [];
}

export function sectorOpacityForPhase(phaseId: ExecutionPhaseId | null, globalPercent: number): number {
  if (!phaseId) return 0.07;
  const phase = getExecutionPhase(phaseId);
  const local = executionPhaseLocalProgress(phaseId, globalPercent);

  if (phase.mapAnimation === 'sectors_fade' || phase.mapAnimation === 'cost_matrix_lines') {
    return 0.07 + local * 0.18;
  }
  if (phase.order >= getExecutionPhase('aco').order) return 0.2;
  return 0.1;
}

export function sectorLineOpacityForPhase(phaseId: ExecutionPhaseId | null, globalPercent: number): number {
  if (!phaseId) return 0.45;
  const local = executionPhaseLocalProgress(phaseId, globalPercent);
  if (phaseId === 'grafo_vial' || phaseId === 'matriz_costos') {
    return 0.35 + local * 0.55;
  }
  return 0.5;
}

export function shouldPulseCriticalContainers(phaseId: ExecutionPhaseId | null): boolean {
  return phaseId === 'instancia_vrp' || phaseId === 'aco';
}

export function isCriticalContainer(fillLevel: number, priority?: string): boolean {
  return priority === 'critica' || fillLevel >= 80;
}

export function executionOverlayMessage(phaseId: ExecutionPhaseId | null): string | null {
  if (!phaseId || phaseId === 'listo') return null;
  if (phaseId === 'preparando') return 'Preparando datos del escenario…';
  if (phaseId === 'persistencia') return 'Guardando rutas optimizadas…';
  if (phaseId === 'preparando_mapa') return 'Cargando rutas en el mapa…';
  return null;
}
