import { describe, expect, it } from 'vitest';
import type { OperatorRouteStop } from '../api/operator';
import {
  routeCollectionFromOperatorSnapshot,
  routeCollectionFromStops,
  straightLineCoordinatesFromStops,
} from './operatorRouteMapLayers';

const stops: OperatorRouteStop[] = [
  {
    waypointId: 1,
    sequenceOrder: 1,
    status: 'pending',
    collectionPointId: 1,
    code: 'CNT-001',
    stopType: 'collection',
    address: 'Parada 1',
    lng: -62.715,
    lat: 8.295,
  },
  {
    waypointId: 2,
    sequenceOrder: 2,
    status: 'pending',
    collectionPointId: 2,
    code: 'CNT-002',
    stopType: 'collection',
    address: 'Parada 2',
    lng: -62.712,
    lat: 8.297,
  },
];

describe('operatorRouteMapLayers', () => {
  it('prefers API lineCoordinates over straight stop vertices', () => {
    const apiLine: Array<[number, number]> = [
      [-62.715, 8.295],
      [-62.714, 8.296],
      [-62.713, 8.2965],
      [-62.712, 8.297],
    ];
    const collection = routeCollectionFromOperatorSnapshot({
      routeId: 21,
      stops,
      lineCoordinates: apiLine,
    });

    expect(collection.features[0]?.geometry.coordinates).toEqual(apiLine);
    expect(collection.features[0]?.geometry.coordinates.length).toBeGreaterThan(stops.length);
  });

  it('falls back to straight line when lineCoordinates is missing', () => {
    const collection = routeCollectionFromOperatorSnapshot({
      routeId: 21,
      stops,
      lineCoordinates: null,
    });
    expect(collection.features[0]?.geometry.coordinates).toEqual(
      straightLineCoordinatesFromStops(stops),
    );
    expect(routeCollectionFromStops(stops).features[0]?.geometry.coordinates).toEqual(
      straightLineCoordinatesFromStops(stops),
    );
  });

  it('falls back when lineCoordinates has fewer than two valid points', () => {
    const collection = routeCollectionFromOperatorSnapshot({
      routeId: 21,
      stops,
      lineCoordinates: [[-62.715, 8.295]],
    });
    expect(collection.features[0]?.geometry.coordinates).toEqual(
      straightLineCoordinatesFromStops(stops),
    );
  });
});
