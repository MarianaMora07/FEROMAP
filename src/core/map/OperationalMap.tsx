import { Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { appState } from '../stores/appStore';
import { bindMapTheme, mapStyleForTheme } from '../utils/mapStyle';
import { createOperationalMapOptions } from './operationalMapConfig';
import { OperationalMapContext, type OperationalMapContextValue } from './operationalMapContext';

export interface OperationalMapProps {
  class?: string;
  containerClass?: string;
  /** Sincroniza claro/oscuro con `appState.darkMode` (desactivar si el padre controla `setStyle`). */
  themeSync?: boolean;
  minZoom?: number;
  maxBounds?: maplibregl.LngLatBoundsLike;
  onMapReady?: (map: MapLibreMap) => void;
  onStyleRestored?: (map: MapLibreMap) => void;
  children?: JSX.Element;
}

export function OperationalMap(props: OperationalMapProps) {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();
  const [mapReady, setMapReady] = createSignal(false);

  const restoreLayers = () => {
    const map = mapRef.current;
    if (!map) return;
    props.onStyleRestored?.(map);
  };

  if (props.themeSync !== false) {
    bindMapTheme(() => mapRef.current, mapReady, restoreLayers);
  }

  onMount(() => {
    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container: mapContainer,
        style: mapStyleForTheme(appState.darkMode),
        minZoom: props.minZoom,
        maxBounds: props.maxBounds,
      }),
    );
    mapRef.current = map;
    setMapInstance(map);
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      setMapReady(true);
      props.onMapReady?.(map);
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    onCleanup(() => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = undefined;
      setMapInstance(undefined);
      setMapReady(false);
    });
  });

  const contextValue: OperationalMapContextValue = {
    map: mapInstance,
    mapReady,
  };

  return (
    <OperationalMapContext.Provider value={contextValue}>
      <div class={`relative h-full w-full ${props.class ?? ''}`}>
        <div
          ref={mapContainer}
          class={`absolute inset-0 h-full w-full ${props.containerClass ?? ''}`}
          data-testid="operational-map-container"
        />
        <Show when={mapReady()}>{props.children}</Show>
      </div>
    </OperationalMapContext.Provider>
  );
}
