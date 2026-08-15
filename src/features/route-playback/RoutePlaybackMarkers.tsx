import { createEffect, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../../core/route-playback/routePlaybackMath';

function createTruckMarker(color: string, label: string) {
  const el = document.createElement('div');
  el.className = 'route-playback-truck-marker';
  el.setAttribute('data-testid', 'route-playback-truck-marker');
  el.innerHTML = `<span class="route-playback-truck-marker__badge" style="background:${color}" title="${label}">🚛</span>`;
  return el;
}

function updateStopMarkerElement(
  element: HTMLElement,
  kind: 'completed' | 'next' | 'pending',
  color: string,
) {
  element.className = `route-playback-stop-marker route-playback-stop-marker--${kind}`;
  const symbol = kind === 'completed' ? '✓' : kind === 'next' ? '●' : '○';
  element.innerHTML = `<span class="route-playback-stop-marker__dot" style="border-color:${color}">${symbol}</span>`;
}

function createStopMarker(kind: 'completed' | 'next' | 'pending', color: string) {
  const el = document.createElement('div');
  updateStopMarkerElement(el, kind, color);
  return el;
}

export interface RoutePlaybackMarkersProps {
  map: () => MapLibreMap | undefined;
  routes: () => RoutePlaybackModel[];
  routeStates: () => RoutePlaybackRouteState[];
}

export function RoutePlaybackMarkers(props: RoutePlaybackMarkersProps) {
  const truckMarkers = new Map<number, Marker>();
  const stopMarkers = new Map<string, Marker>();

  const clear = () => {
    truckMarkers.forEach((marker) => marker.remove());
    stopMarkers.forEach((marker) => marker.remove());
    truckMarkers.clear();
    stopMarkers.clear();
  };

  createEffect(() => {
    const map = props.map();
    const routes = props.routes();
    const routeStates = props.routeStates();
    if (!map) return;

    const activeRouteIds = new Set(routes.map((route) => route.routeId));
    for (const [routeId, marker] of truckMarkers.entries()) {
      if (!activeRouteIds.has(routeId)) {
        marker.remove();
        truckMarkers.delete(routeId);
      }
    }

    for (const route of routes) {
      const state = routeStates.find((item) => item.routeId === route.routeId);
      if (!state) continue;

      let truckMarker = truckMarkers.get(route.routeId);
      if (!truckMarker) {
        truckMarker = new maplibregl.Marker({
          element: createTruckMarker(route.color, route.vehicleLabel),
          anchor: 'center',
        }).addTo(map);
        truckMarkers.set(route.routeId, truckMarker);
      }
      truckMarker.setLngLat(state.position);
    }

    const nextStopKeys = new Set<string>();
    for (const route of routes) {
      const state = routeStates.find((item) => item.routeId === route.routeId);
      if (!state) continue;

      route.stops.forEach((stop, index) => {
        const key = `${route.routeId}-${stop.sequence}`;
        nextStopKeys.add(key);

        let kind: 'completed' | 'next' | 'pending' = 'pending';
        if (index < state.completedStops) kind = 'completed';
        else if (index === state.currentStopIndex) kind = 'next';

        let marker = stopMarkers.get(key);
        if (!marker) {
          marker = new maplibregl.Marker({
            element: createStopMarker(kind, route.color),
            anchor: 'center',
          })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map);
          stopMarkers.set(key, marker);
        } else {
          updateStopMarkerElement(marker.getElement(), kind, route.color);
          marker.setLngLat([stop.lng, stop.lat]);
        }
      });
    }

    for (const [key, marker] of stopMarkers.entries()) {
      if (!nextStopKeys.has(key)) {
        marker.remove();
        stopMarkers.delete(key);
      }
    }
  });

  onCleanup(() => {
    clear();
  });

  return null;
}
