import { createEffect, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { isLandfillPlaybackStop } from '../../core/route-playback/routePlaybackValidation';
import { truckMarkerLabel } from '../../core/route-playback/routePlaybackMath';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../../core/route-playback/routePlaybackMath';

const TRUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;

function createTruckMarker(color: string) {
  const el = document.createElement('div');
  el.className = 'route-playback-truck-marker';
  el.setAttribute('data-testid', 'route-playback-truck-marker');
  el.innerHTML = `
    <div class="route-playback-truck-marker__label" data-role="label"></div>
    <div class="route-playback-truck-marker__rotate" data-role="rotate">
      <span class="route-playback-truck-marker__body" style="background:${color}">
        ${TRUCK_SVG}
      </span>
    </div>
  `;
  return el;
}

function updateTruckMarkerElement(
  element: HTMLElement,
  route: RoutePlaybackModel,
  state: RoutePlaybackRouteState,
) {
  const label = element.querySelector('[data-role="label"]');
  const rotate = element.querySelector('[data-role="rotate"]') as HTMLElement | null;
  if (label) {
    label.textContent = truckMarkerLabel(route, state);
    label.setAttribute('title', route.vehicleLabel);
  }
  if (rotate) {
    rotate.style.transform = `rotate(${state.bearing}deg)`;
  }
}

function updateStopMarkerElement(
  element: HTMLElement,
  kind: 'completed' | 'next' | 'pending',
  color: string,
  isLandfill: boolean,
) {
  element.className = `route-playback-stop-marker route-playback-stop-marker--${kind}${
    isLandfill ? ' route-playback-stop-marker--landfill' : ''
  }`;
  const symbol = isLandfill ? '♻' : kind === 'completed' ? '✓' : kind === 'next' ? '●' : '○';
  element.innerHTML = `<span class="route-playback-stop-marker__dot" style="border-color:${color}">${symbol}</span>`;
}

function createStopMarker(kind: 'completed' | 'next' | 'pending', color: string, isLandfill: boolean) {
  const el = document.createElement('div');
  updateStopMarkerElement(el, kind, color, isLandfill);
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
          element: createTruckMarker(route.color),
          anchor: 'center',
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        }).addTo(map);
        truckMarkers.set(route.routeId, truckMarker);
      }
      updateTruckMarkerElement(truckMarker.getElement(), route, state);
      truckMarker.setLngLat(state.position);
    }

    const nextStopKeys = new Set<string>();
    for (const route of routes) {
      const state = routeStates.find((item) => item.routeId === route.routeId);
      if (!state) continue;

      route.stops.forEach((stop, index) => {
        const key = `${route.routeId}-${stop.sequence}`;
        nextStopKeys.add(key);
        const isLandfill = isLandfillPlaybackStop(stop);

        let kind: 'completed' | 'next' | 'pending' = 'pending';
        if (index < state.completedStops) kind = 'completed';
        else if (index === state.currentStopIndex) kind = 'next';

        let marker = stopMarkers.get(key);
        if (!marker) {
          marker = new maplibregl.Marker({
            element: createStopMarker(kind, route.color, isLandfill),
            anchor: 'center',
          })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map);
          stopMarkers.set(key, marker);
        } else {
          updateStopMarkerElement(marker.getElement(), kind, route.color, isLandfill);
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
