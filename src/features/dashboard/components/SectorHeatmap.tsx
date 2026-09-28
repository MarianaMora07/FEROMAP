import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Polygon } from 'geojson';
import { Badge } from '../../../design-system/components';
import { fetchDashboardSummary, type DashboardSectorFill } from '../../../core/api/dashboard';
import { fetchSectors } from '../../../core/api/sectors';
import {
  createOperationalMapOptions,
  fitMapToStudyArea,
} from '../../../core/map/operationalMapConfig';
import { appState } from '../../../core/stores/appStore';
import type { SectorCollection } from '../../../core/types/geo';
import { resolveMapStyle } from '../../../core/utils/mapStyleConfig';

export interface SectorHeatmapProps {
  class?: string;
  height?: number;
}

interface SelectedSector {
  name: string;
  fillLevel: number;
  criticalCount: number;
  overflowCount: number;
}

const SOURCE_ID = 'sectors-heatmap';
const FILL_LAYER_ID = 'sectors-heatmap-fill';
const LINE_LAYER_ID = 'sectors-heatmap-border';

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('es');
}

function fillLabel(pct: number): string {
  if (pct >= 85) return 'Crítico (85-100%)';
  if (pct >= 70) return 'Alto (70-85%)';
  if (pct >= 40) return 'Medio (40-70%)';
  return 'Normal (0-40%)';
}

function badgeVariant(pct: number): 'danger' | 'warning' | 'success' {
  if (pct >= 85) return 'danger';
  if (pct >= 40) return 'warning';
  return 'success';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char] ?? char;
  });
}

function toHeatmap(
  sectors: SectorCollection,
  levels: DashboardSectorFill[],
): FeatureCollection<Polygon, SelectedSector> {
  const byName = new Map(levels.map((level) => [normalizeName(level.name), level]));
  return {
    type: 'FeatureCollection',
    features: sectors.features.map((feature) => {
      const level = byName.get(normalizeName(feature.properties.name));
      return {
        type: 'Feature',
        properties: {
          name: feature.properties.name,
          fillLevel: level?.pct ?? 0,
          criticalCount: level?.criticalCount ?? 0,
          overflowCount: level?.overflowCount ?? 0,
        },
        geometry: feature.geometry,
      };
    }),
  };
}

export function SectorHeatmap(props: SectorHeatmapProps) {
  let container!: HTMLDivElement;
  const [map, setMap] = createSignal<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sectors, setSectors] = createSignal<SectorCollection | null>(null);
  const [fills, setFills] = createSignal<DashboardSectorFill[]>([]);
  const [selectedSector, setSelectedSector] = createSignal<SelectedSector | null>(null);

  onMount(() => {
    let cancelled = false;

    void Promise.all([fetchDashboardSummary(), fetchSectors()])
      .then(([summary, sectorCollection]) => {
        if (cancelled) return;
        setFills(summary.sectorFillLevels ?? []);
        setSectors(sectorCollection);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el mapa de calor.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void resolveMapStyle(appState.darkMode).then((style) => {
      if (cancelled || !container) return;
      const instance = new maplibregl.Map(
        createOperationalMapOptions({
          container,
          style,
        }),
      );
      instance.addControl(new maplibregl.NavigationControl(), 'top-right');
      instance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      instance.on('load', () => {
        if (cancelled) return;
        instance.resize();
        setMap(instance);
        setMapReady(true);
      });
    });

    onCleanup(() => {
      cancelled = true;
      map()?.remove();
      setMap(null);
      setMapReady(false);
    });
  });

  createEffect(() => {
    const instance = map();
    const collection = sectors();
    const levels = fills();
    if (!instance || !mapReady() || !collection) return;

    const data = toHeatmap(collection, levels);
    const source = instance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }

    instance.addSource(SOURCE_ID, { type: 'geojson', data });
    instance.addLayer({
      id: FILL_LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['get', 'fillLevel'],
          0,
          '#34D634',
          40,
          '#f59e0b',
          70,
          '#f59e0b',
          85,
          '#ef4444',
        ],
        'fill-opacity': 0.55,
      },
    });
    instance.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.5,
        'line-opacity': 0.9,
      },
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    instance.on('mousemove', FILL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      const properties = feature?.properties;
      if (!properties) return;
      const pct = Number(properties.fillLevel ?? 0);
      instance.getCanvas().style.cursor = 'pointer';
      popup
        .setLngLat(event.lngLat)
        .setHTML(
          `<strong>${escapeHtml(String(properties.name ?? ''))}</strong><br>Llenado: <strong>${pct}%</strong><br>${escapeHtml(fillLabel(pct))}`,
        )
        .addTo(instance);
    });
    instance.on('mouseleave', FILL_LAYER_ID, () => {
      instance.getCanvas().style.cursor = '';
      popup.remove();
    });
    instance.on('click', FILL_LAYER_ID, (event) => {
      const properties = event.features?.[0]?.properties;
      if (!properties) return;
      setSelectedSector({
        name: String(properties.name ?? ''),
        fillLevel: Number(properties.fillLevel ?? 0),
        criticalCount: Number(properties.criticalCount ?? 0),
        overflowCount: Number(properties.overflowCount ?? 0),
      });
    });

    fitMapToStudyArea(instance, { sectors: collection, duration: 0 });
  });

  return (
    <section class={props.class} data-testid="sector-heatmap">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="font-heading text-xl font-bold text-text-primary dark:text-white">
            Mapa de calor — llenado por sector
          </h3>
          <p class="text-sm text-text-muted">Nivel de llenado promedio por sector</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="success">Normal (0-40%)</Badge>
          <Badge variant="warning">Medio (40-70%)</Badge>
          <Badge variant="warning">Alto (70-85%)</Badge>
          <Badge variant="danger">Crítico (85%+)</Badge>
        </div>
      </div>

      <div class="relative">
        <div
          ref={container}
          class="overflow-hidden rounded-xl border border-default bg-surface"
          style={{ height: `${props.height ?? 400}px` }}
        />

        <Show when={loading()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/80 text-sm text-text-muted">
            Cargando mapa de calor…
          </div>
        </Show>

        <Show when={error()}>
          {(message) => (
            <div class="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/90 px-4 text-center text-sm text-red-600">
              {message()}
            </div>
          )}
        </Show>

        <Show when={selectedSector()}>
          {(sector) => (
            <div class="absolute bottom-4 right-4 z-10 w-72 rounded-xl border border-default bg-surface p-4 shadow-xl">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="font-semibold text-text-primary dark:text-white">{sector().name}</h4>
                <button
                  type="button"
                  class="text-sm text-text-muted hover:text-text-primary"
                  onClick={() => setSelectedSector(null)}
                >
                  Cerrar
                </button>
              </div>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between gap-3">
                  <span class="text-text-muted">Llenado</span>
                  <span class="font-bold">{sector().fillLevel}%</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-text-muted">Estado</span>
                  <Badge variant={badgeVariant(sector().fillLevel)}>{fillLabel(sector().fillLevel)}</Badge>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-text-muted">Críticos</span>
                  <span class="font-medium">{sector().criticalCount}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-text-muted">Desbordados</span>
                  <span class="font-medium">{sector().overflowCount}</span>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </section>
  );
}
