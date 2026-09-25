import { CheckCircle2 } from 'lucide-solid';
import { Show } from 'solid-js';
import { optimizationState } from '../../core/stores/optimizationStore';

function formatKm(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} km`;
}

function formatMinutes(value: number | null | undefined): string {
  if (value == null) return '—';
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Resultado real del día (Fase 4): se muestra cuando el día fue cerrado y el backend
 * consolidó `PlanVsReal` en `daily_plans.actual_kpis_json`.
 */
export function OptimizationDayActualsPanel() {
  const actual = () => optimizationState.dailyPlan?.actualKpis ?? null;

  return (
    <Show when={actual()}>
      {(real) => (
        <section class="py-2" data-testid="optimization-day-actuals">
          <div class="flex items-start gap-2">
            <CheckCircle2 size={16} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                Previsto vs. real del día
              </p>
              <dl class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Distancia prevista</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {formatKm(real().plannedDistanceKm)}
                  </dd>
                </div>
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Distancia real</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {formatKm(real().actualDistanceKm)}
                  </dd>
                </div>
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Duración real</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {formatMinutes(real().actualDurationMin)}
                  </dd>
                </div>
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Puntos servidos</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {real().servedPoints}/{real().scheduledPoints}
                  </dd>
                </div>
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Recolectado</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {real().collectedKg.toFixed(1)} kg
                  </dd>
                </div>
                <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
                  <dt class="text-xs text-text-muted">Cumplimiento</dt>
                  <dd class="text-sm font-semibold text-text-primary dark:text-white">
                    {formatPct(real().completionPct)}
                  </dd>
                </div>
              </dl>
              {/* Día cerrado sin ejecución en campo: el «real» no tiene datos que mostrar. */}
              <Show when={real().servedPoints === 0}>
                <p
                  class="mt-3 text-xs text-text-muted"
                  data-testid="optimization-day-actuals-no-execution"
                >
                  Sin ejecución registrada: ninguna parada se confirmó en campo, así que no hay
                  distancia, duración ni peso reales. El plan previsto es la referencia de arriba y
                  las paradas no visitadas pasaron a pendientes.
                </p>
              </Show>
            </div>
          </div>
        </section>
      )}
    </Show>
  );
}
