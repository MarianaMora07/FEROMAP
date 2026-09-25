import { For, Show } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { BookOpen, Crosshair, Maximize2, Minus, Plus, Search, Trash2, Truck } from 'lucide-solid';
import { Card } from '../../design-system/components';
import { OperationalMap } from '../../core/map/OperationalMap';
import { fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import type { RouteCollection } from '../../core/types/geo';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import type { MonitoringPlaybackMode } from '../../core/monitoring/monitoringPlaybackUx';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import { OperatorMobilePlaybackControls } from '../operator/OperatorMobilePlaybackControls';
import { vehicleFilterOptions, type LiveVehicle } from '../../data/mock/monitoring';

interface MonitoringMapCardProps {
  fieldMode: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  legendOpen: boolean;
  onToggleLegend: () => void;
  mapRef: { current?: MapLibreMap };
  mapReady: boolean;
  mapInstance: MapLibreMap | undefined;
  playbackOpen: boolean;
  playbackMode: MonitoringPlaybackMode;
  playback: RoutePlaybackController;
  playbackRoutes: RoutePlaybackModel[];
  operatorVehicle: LiveVehicle | null;
  onCenterVehicle: (id: string) => void;
  mapFleet: LiveVehicle[];
  operationalRoutes: RouteCollection;
  onMapReady: (map: MapLibreMap) => void;
  onStyleRestored: () => void;
}

export function MonitoringMapCard(props: MonitoringMapCardProps) {
  return (
    <Card
      padding={false}
      class={`flex min-h-0 flex-col overflow-hidden xl:h-full ${
        props.fieldMode ? 'min-h-[50vh]' : 'xl:col-span-3'
      }`}
    >
      <Show when={!props.fieldMode}>
      <div class="flex flex-wrap items-center gap-2 border-b border-default p-3 sm:gap-3 sm:px-4">
        <div class="relative min-w-0 flex-1 basis-48">
          <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            aria-label="Buscar vehículo o conductor"
            placeholder="Buscar vehículo o conductor..."
            value={props.search}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            class="w-full rounded-md border border-default bg-elevated py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none"
          />
        </div>
        <select
          value={props.statusFilter}
          aria-label="Filtrar por estado del vehículo"
          onChange={(e) => props.onStatusFilterChange(e.currentTarget.value)}
          class="rounded-md border border-default bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
        >
          <For each={vehicleFilterOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
        </select>
        <button
          type="button"
          class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
            props.legendOpen
              ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
              : 'border-default text-text-secondary hover:bg-app'
          }`}
          onClick={() => props.onToggleLegend()}
        >
          <BookOpen size={14} />
          Leyenda
        </button>
      </div>
      </Show>

      <div
        class={`relative min-h-80 flex-1 bg-app ${
          props.fieldMode ? 'min-h-[50vh]' : 'lg:min-h-105'
        }`}
      >
        <OperationalMap
          onMapReady={props.onMapReady}
          onStyleRestored={props.onStyleRestored}
        >
        <Show when={props.playbackOpen}>
          <RoutePlaybackLegend class="absolute bottom-16 left-3 z-10 max-w-[220px]" />
          <RoutePlaybackLayer
            map={() => props.mapInstance}
            routes={() => props.playbackRoutes}
            playback={props.playback}
            showControls={false}
          />
          <Show when={props.fieldMode}>
            <OperatorMobilePlaybackControls playback={props.playback} />
          </Show>
        </Show>

        <Show when={props.playbackOpen && !props.fieldMode}>
          <div class="absolute top-3 left-3 z-10 rounded-md border border-fero-blue/40 bg-elevated/95 px-2.5 py-1.5 text-xs font-semibold text-fero-blue shadow-sm backdrop-blur-sm">
            Reproducción {props.playbackMode === 'visual' ? 'solo visual' : 'híbrida'}
          </div>
        </Show>

        <Show when={props.legendOpen}>
          <div class="absolute top-3 left-3 z-10 rounded-md border border-default bg-elevated/95 p-2.5 text-xs shadow-md backdrop-blur-sm">
            <p class="mb-1.5 font-semibold text-text-primary">Leyenda</p>
            <ul class="space-y-1 text-text-secondary">
              <li class="flex items-center gap-2"><Truck size={12} class="text-fero-green-dark" /> En ruta</li>
              <li class="flex items-center gap-2"><Truck size={12} class="text-amber-500" /> Mantenimiento</li>
              <li class="flex items-center gap-2"><Truck size={12} class="text-red-500" /> Detenido</li>
              <li class="flex items-center gap-2"><Trash2 size={12} class="text-fero-green-dark" /> Contenedor normal</li>
              <li class="flex items-center gap-2"><Trash2 size={12} class="text-amber-500" /> Contenedor lleno</li>
              <li class="flex items-center gap-2"><Trash2 size={12} class="text-red-500" /> Contenedor crítico</li>
            </ul>
          </div>
        </Show>

        <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-default bg-elevated/95 shadow-sm backdrop-blur-sm">
          <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-app disabled:opacity-40" disabled={!props.mapReady} onClick={() => props.mapRef.current?.zoomIn()} aria-label="Acercar">
            <Plus size={14} />
          </button>
          <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app disabled:opacity-40" disabled={!props.mapReady} onClick={() => props.mapRef.current?.zoomOut()} aria-label="Alejar">
            <Minus size={14} />
          </button>
          <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app disabled:opacity-40" disabled={!props.mapReady} onClick={() => {
            const vehicle = props.operatorVehicle;
            if (vehicle) props.onCenterVehicle(vehicle.id);
            else fitMapToOperationalData(props.mapRef.current!, {
              vehicles: props.mapFleet,
              routes: props.operationalRoutes,
            });
          }} aria-label="Centrar">
            <Crosshair size={14} />
          </button>
          <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.()}>
            <Maximize2 size={14} />
          </button>
        </div>
        </OperationalMap>
      </div>
    </Card>
  );
}
