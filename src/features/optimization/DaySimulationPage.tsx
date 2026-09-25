import { Show, createEffect, createMemo, createResource, createSignal, untrack } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { OperationalMap } from '../../core/map/OperationalMap';
import { fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import { fetchDaySimulation } from '../../core/api/daySimulation';
import { optimizationHref } from '../../core/planning/operationalLinks';
import { useDaySimulation } from '../route-playback/useDaySimulation';
import { buildDayVehicleOptions, filterPlaybackRoutesByLabels, inPlayVehicleLabels } from '../route-playback/daySimulationUx';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import { DaySimulationPanel } from './DaySimulationPanel';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Vista propia de la simulación guionada del día: el mapa es el protagonista y el
 * panel de control (progreso, estabilidad, contingencia, tramo) va flotando encima.
 *
 * Solo lectura: el backend precomputa la secuencia con dry-run y no persiste nada.
 */
export default function DaySimulationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const dailyPlanId = () => {
    const value = Number(firstParam(searchParams.dailyPlanId));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const operationDate = () => firstParam(searchParams.date) ?? '';

  const [simulation] = createResource(dailyPlanId, async (id) => {
    if (!id) return null;
    return fetchDaySimulation(id);
  });

  const controller = useDaySimulation(() => simulation() ?? null);

  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();
  let fitted = false;

  // Selección de camiones a representar (por etiqueta de vehículo). Vacío = todos.
  const [hiddenLabels, setHiddenLabels] = createSignal<ReadonlySet<string>>(new Set());
  const visibleRoutes = createMemo(() =>
    filterPlaybackRoutesByLabels(controller.routes(), hiddenLabels()),
  );
  const fleet = createMemo(() => {
    const sim = simulation();
    if (!sim) return [];
    // Unión de todo el día (base + alternativos), marcando el origen: la lista sigue
    // siendo estable aunque el tramo actual fusione o quite rutas entre pasos.
    return buildDayVehicleOptions(
      sim,
      new Set(controller.routes().map((route) => route.vehicleLabel)),
    );
  });
  const toggleVehicle = (label: string) =>
    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const showAllVehicles = () => setHiddenLabels(new Set<string>());
  const hideAllVehicles = () => setHiddenLabels(new Set(inPlayVehicleLabels(fleet())));

  // Al cambiar de día, reinicia la selección (todos visibles).
  createEffect(() => {
    simulation();
    untrack(() => setHiddenLabels(new Set<string>()));
  });

  const fitToRoutes = (map: MapLibreMap) => {
    const points = controller
      .routes()
      .flatMap((route) => route.lineCoordinates.map(([lng, lat]) => ({ lng, lat })));
    if (points.length > 0) {
      fitMapToOperationalData(map, { points });
    }
  };

  const handleMapReady = (map: MapLibreMap) => {
    setMapInstance(map);
    fitToRoutes(map);
    fitted = true;
  };

  // Si las rutas llegan después del mapa, encuadra una sola vez.
  createEffect(() => {
    const map = mapInstance();
    if (!map || fitted || controller.routes().length === 0) return;
    fitToRoutes(map);
    fitted = true;
  });

  const goBack = () =>
    navigate(optimizationHref({ dailyPlanId: dailyPlanId() ?? undefined, date: operationDate() || undefined }));

  const errorMessage = () => {
    const error = simulation.error;
    if (!error) return null;
    return error instanceof Error ? error.message : 'No se pudo preparar la simulación del día';
  };

  return (
    <div class="space-y-4" data-testid="day-simulation-page">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="page-title" class="font-heading text-xl font-bold text-text-primary">Simulación de recorrido</h1>
          <p class="text-sm text-text-muted">
            {operationDate() || 'Plan del día'} · animación comprimida (~5 min)
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Show when={controller.isPlaying()}>
            <span class="rounded-full bg-fero-blue/10 px-2.5 py-0.5 text-xs font-semibold text-fero-blue">
              En reproducción
            </span>
          </Show>
          <A
            href={optimizationHref({
              dailyPlanId: dailyPlanId() ?? undefined,
              date: operationDate() || undefined,
            })}
          >
            <Button variant="outline" size="sm" icon={<ArrowLeft size={14} />}>
              Volver al plan
            </Button>
          </A>
        </div>
      </div>

      <Show when={dailyPlanId() == null}>
        <div class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center">
          <p class="text-base font-semibold text-text-primary">No hay un día seleccionado</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
            Abre la simulación desde el plan del día (botón «Simular día (dry-run)») para animar su
            recorrido y las contingencias.
          </p>
          <div class="mt-4 flex justify-center">
            <A href="/optimization">
              <Button variant="primary" size="sm">
                Ir a planificación operativa
              </Button>
            </A>
          </div>
        </div>
      </Show>

      <Show when={dailyPlanId() != null}>
        <div class="relative h-[calc(100vh-11rem)] min-h-[560px] overflow-hidden rounded-xl border border-default bg-app">
          <OperationalMap onMapReady={handleMapReady}>
            <RoutePlaybackLegend class="absolute bottom-3 left-3 z-10 max-w-[220px]" showPassedStops />
            <RoutePlaybackLayer
              map={mapInstance}
              routes={visibleRoutes}
              playback={controller}
              showControls={false}
              passedStopColor="#ef4444"
            />
          </OperationalMap>

          <DaySimulationPanel
            controller={controller}
            simulation={simulation() ?? null}
            operationDate={operationDate()}
            loading={simulation.loading}
            error={errorMessage()}
            vehicles={fleet()}
            isVehicleHidden={(label) => hiddenLabels().has(label)}
            onToggleVehicle={toggleVehicle}
            onShowAllVehicles={showAllVehicles}
            onHideAllVehicles={hideAllVehicles}
            onClose={goBack}
          />
        </div>
      </Show>
    </div>
  );
}
