import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Show, createEffect, onCleanup, onMount } from 'solid-js';
import type { CaseStudyGeoJson } from '../../core/api/caseStudies';
import { createOperationalMapOptions, fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import { appState } from '../../core/stores/appStore';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';

interface CaseStudyMapPanelProps {
  geojson: CaseStudyGeoJson | undefined;
  selectedPointId: number | null;
  onSelectPoint: (collectionPointId: number) => void;
  onTogglePoint?: (collectionPointId: number) => void;
  selectionMode?: boolean;
  heightClass?: string;
}

function fillColor(pct: number, selected: boolean): string {
  if (selected) return '#15803d';
  if (pct >= 80) return '#dc2626';
  if (pct >= 50) return '#ea580c';
  return '#2563eb';
}

export function CaseStudyMapPanel(props: CaseStudyMapPanelProps) {
  let containerRef: HTMLDivElement | undefined;
  let mapRef: maplibregl.Map | null = null;
  let mapReady = false;
  const markers: maplibregl.Marker[] = [];

  const clearMarkers = () => {
    for (const marker of markers) marker.remove();
    markers.length = 0;
  };

  const renderMarkers = () => {
    const map = mapRef;
    if (!map || !props.geojson) return;
    clearMarkers();

    const pointCoords: Array<{ lng: number; lat: number }> = [];

    for (const feature of props.geojson.features) {
      const coords = feature.geometry?.coordinates;
      if (!coords || feature.geometry?.type !== 'Point') continue;
      const pointId = Number(feature.properties?.collectionPointId);
      if (!Number.isFinite(pointId)) continue;

      pointCoords.push({ lng: coords[0], lat: coords[1] });

      const fillLevel = Number(feature.properties?.fillLevel ?? 0);
      const selected = props.selectedPointId === pointId;
      const el = document.createElement('button');
      el.type = 'button';
      el.title = String(feature.properties?.code ?? pointId);
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '9999px';
      el.style.border = selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.85)';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)';
      el.style.background = fillColor(fillLevel, selected);
      el.style.cursor = 'pointer';

      el.addEventListener('click', (event) => {
        event.stopPropagation();
        if (props.selectionMode && props.onTogglePoint) {
          props.onTogglePoint(pointId);
        } else {
          props.onSelectPoint(pointId);
        }
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coords[0], coords[1]])
        .addTo(map);
      markers.push(marker);
    }

    fitMapToOperationalData(map, { points: pointCoords });
  };

  bindMapTheme(
    () => mapRef,
    () => mapReady,
    () => renderMarkers(),
  );

  onMount(() => {
    if (!containerRef) return;
    mapRef = new maplibregl.Map(
      createOperationalMapOptions({
        container: containerRef,
        style: mapStyleForTheme(appState.darkMode),
      }),
    );
    mapRef.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    mapRef.on('load', () => {
      mapReady = true;
      mapRef?.resize();
      renderMarkers();
    });

    onCleanup(() => {
      clearMarkers();
      mapRef?.remove();
      mapRef = null;
      mapReady = false;
    });
  });

  createEffect(() => {
    if (mapReady && mapRef) {
      renderMarkers();
    }
  });

  return (
    <div
      class={`relative overflow-hidden rounded-xl border border-border dark:border-dark-border ${props.heightClass ?? 'h-[320px]'}`}
    >
      <div ref={containerRef} class="h-full w-full" data-testid="case-study-map" />
      <Show when={!props.geojson?.features?.length}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/80 text-sm text-text-muted dark:bg-dark-surface/80">
          Sin puntos activos en el mapa
        </div>
      </Show>
    </div>
  );
}
