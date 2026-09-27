import { Show } from 'solid-js';
import { FastForward } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { BreakdownReporter } from '../contingency/BreakdownReporter';
import { CriticalContainerRecalc } from './CriticalContainerRecalc';
import { MonitoringPlaybackToggle } from './MonitoringPlaybackPanel';
import type { OperatorRouteSnapshot } from '../../core/api/operator';
import type { ContainerCollection } from '../../core/types/geo';
import type { LiveVehicle } from '../../data/mock/monitoring';

interface MonitoringActionBarProps {
  fieldMode: boolean;
  monitorTab: 'map' | 'incidents';
  operationDate: string;
  operatorVehicle: LiveVehicle | null;
  vehicles: LiveVehicle[];
  routeSnapshot: OperatorRouteSnapshot | undefined;
  containers: ContainerCollection | undefined;
  dailyPlanId: number | undefined;
  onBreakdownComplete: () => void;
  onRecalcComplete: () => void;
  canOpenPlayback: boolean;
  playbackOpen: boolean;
  onOpenPlayback: () => void;
  canSimulateAdvance: boolean;
  isSupervisor: boolean;
  advancing: boolean;
  inRouteCount: number;
  onAdvance: () => void;
}

export function MonitoringActionBar(props: MonitoringActionBarProps) {
  return (
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Show when={props.fieldMode}>
        <p class="mr-auto text-sm text-text-secondary">
          Tu vehículo en campo
          <Show when={props.operatorVehicle}>
            {(vehicle) => <span class="font-semibold text-text-primary"> · {vehicle().id}</span>}
          </Show>
          <Show when={props.operationDate !== new Date().toISOString().slice(0, 10)}>
            <span class="ml-1 text-text-muted">· Contexto: {props.operationDate}</span>
          </Show>
        </p>
      </Show>
      <div id="reportar-averia" class="flex flex-wrap items-center gap-2">
        <Show when={props.monitorTab === 'incidents'}>
        <BreakdownReporter
          variant={props.fieldMode ? 'operator' : 'planner'}
          compact={!props.fieldMode}
          vehicles={props.vehicles.map((v) => ({
            id: v.id,
            routeId: v.routeId,
            status: v.status,
          }))}
          onComplete={props.onBreakdownComplete}
        />
        <Show when={props.fieldMode && (props.routeSnapshot?.stops.length ?? 0) > 0}>
          <CriticalContainerRecalc
            compact
            containers={props.containers}
            dailyPlanId={props.dailyPlanId}
            routePointCodes={props.routeSnapshot?.stops.map((stop) => stop.code) ?? []}
            onComplete={props.onRecalcComplete}
          />
        </Show>
        <Show when={!props.fieldMode}>
          <CriticalContainerRecalc
            compact
            containers={props.containers}
            dailyPlanId={props.dailyPlanId}
            onComplete={props.onRecalcComplete}
          />
        </Show>
        </Show>
        <Show when={props.monitorTab === 'map'}>
        <MonitoringPlaybackToggle
          visible={props.canOpenPlayback && !props.fieldMode}
          open={props.playbackOpen}
          fieldMode={props.fieldMode}
          onOpen={props.onOpenPlayback}
        />
        <Show
          when={props.canSimulateAdvance}
          fallback={
            <Show when={props.isSupervisor}>
              <p class="max-w-xs text-xs text-text-muted">
                El avance operativo discreto de flota es solo para conductores en campo.
              </p>
            </Show>
          }
        >
          <Button
            variant="outline"
            size={props.fieldMode ? 'lg' : 'sm'}
            class={`gap-2 ${props.fieldMode ? 'min-h-12' : ''}`}
            icon={<FastForward size={props.fieldMode ? 18 : 16} />}
            disabled={
              props.advancing ||
              (!props.fieldMode && props.playbackOpen) ||
              (props.fieldMode
                ? props.operatorVehicle?.routeId == null && props.routeSnapshot?.routeId == null
                : !props.inRouteCount)
            }
            onClick={() => void props.onAdvance()}
            title="Avance operativo simulado (salta parada a parada en BD)"
          >
            {props.advancing
              ? 'Avanzando…'
              : props.fieldMode
                ? 'Avance simulado'
                : 'Avance operativo flota'}
          </Button>
        </Show>
        </Show>
      </div>
    </div>
  );
}
