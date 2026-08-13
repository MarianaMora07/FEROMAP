import { createStore } from 'solid-js/store';
import {
  reportVehicleBreakdown,
  type VehicleBreakdownRequest,
  type VehicleBreakdownResponse,
} from '../api/contingencies';
import { useMocks } from '../api/client';

interface OperatorContingencyState {
  reporting: boolean;
  lastReport: VehicleBreakdownResponse | null;
  error: string | null;
}

const [state, setState] = createStore<OperatorContingencyState>({
  reporting: false,
  lastReport: null,
  error: null,
});

export function operatorContingencySuccessMessage(result: VehicleBreakdownResponse): string {
  return `Incidencia #${result.incident.id} registrada — planificación revisará pendientes`;
}

export async function submitOperatorBreakdown(
  payload: VehicleBreakdownRequest,
): Promise<VehicleBreakdownResponse> {
  setState({ reporting: true, error: null });

  try {
    if (useMocks) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const incidentId = Math.floor(Date.now() / 1000) % 10000;
      const mock: VehicleBreakdownResponse = {
        incident: {
          id: incidentId,
          vehicleId: payload.vehicleId,
          vehicleDbId: 1,
          routeId: payload.routeId ?? null,
          incidentType: 'breakdown',
          description: payload.description ?? `Avería en ${payload.vehicleId}`,
          reportedAt: new Date().toISOString(),
          affectsActiveRoute: true,
          relatedAlertId: `al-inc-${incidentId}`,
        },
        skippedWaypoints: 3,
        pendingPoints: 3,
        recalculation: null,
        message: `Incidencia #${incidentId} registrada — planificación revisará pendientes`,
      };
      setState({ lastReport: mock, reporting: false });
      return mock;
    }

    const result = await reportVehicleBreakdown(payload);
    setState({ lastReport: result, reporting: false });
    return result;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'No se pudo registrar la avería. Intenta de nuevo.';
    setState({ reporting: false, error: message });
    throw err;
  }
}

export function clearOperatorContingencyReport() {
  setState({ lastReport: null, error: null });
}

export function dismissOperatorContingencyError() {
  setState('error', null);
}

export { state as operatorContingencyState };
