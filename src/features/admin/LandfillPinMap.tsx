import { createEffect, onCleanup, onMount } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createOperationalMapOptions } from '../../core/map/operationalMapConfig';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { appState } from '../../core/stores/appStore';
import { DEFAULT_OPERATIONAL_FACILITIES } from '../../core/types/operationalSettings';
import { createLandfillMarkerElement } from '../../core/map/landfillMapLayers';

interface LandfillPinMapProps {
  lat: number;
  lon: number;
  onCoordsChange: (coords: { lat: number; lon: number }) => void;
}

export function LandfillPinMap(props: LandfillPinMapProps) {
  let container!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  let marker: Marker | undefined;
  let mapReady = false;

  const syncMarker = (lat: number, lon: number, draggable = true) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat: [number, number] = [lon, lat];
    if (!marker) {
      const el = createLandfillMarkerElement();
      marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable })
        .setLngLat(lngLat)
        .addTo(map);
      marker.on('dragend', () => {
        const pos = marker!.getLngLat();
        props.onCoordsChange({ lat: pos.lat, lon: pos.lng });
      });
      return;
    }
    marker.setLngLat(lngLat);
  };

  bindMapTheme(
    () => mapRef.current,
    () => mapReady,
    () => syncMarker(props.lat, props.lon),
  );

  onMount(() => {
    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container,
        style: mapStyleForTheme(appState.darkMode),
        center: [props.lon || DEFAULT_OPERATIONAL_FACILITIES.landfillLon, props.lat || DEFAULT_OPERATIONAL_FACILITIES.landfillLat],
        zoom: 13,
      }),
    );
    mapRef.current = map;
    map.on('load', () => {
      mapReady = true;
      syncMarker(props.lat, props.lon);
    });

    onCleanup(() => {
      marker?.remove();
      marker = undefined;
      map.remove();
      mapRef.current = undefined;
      mapReady = false;
    });
  });

  createEffect(() => {
    syncMarker(props.lat, props.lon, false);
  });

  return (
    <div class="space-y-2">
      <div
        ref={container}
        class="h-52 w-full overflow-hidden rounded-lg border border-border dark:border-dark-border"
        data-testid="landfill-pin-map"
      />
      <p class="text-xs text-text-muted">Arrastra el pin para ajustar la ubicación del vertedero.</p>
    </div>
  );
}
