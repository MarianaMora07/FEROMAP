import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { CalendarRange, ExternalLink, Radio, RefreshCw, Send, Truck, Zap } from 'lucide-solid';
import { Button } from '../../../design-system/components';
import { fetchAlgorithmSettings, updateAlgorithmSettings } from '../../../core/api/admin';
import {
  dispatchDailyPlan,
  notifyWeeklyOperationalDays,
  type WeeklyOperationalPlan,
  type WeeklyPlanDayOperational,
  type WeeklyPlanForecast,
} from '../../../core/api/planning';
import { generateWeeklyOperationalPlanForWeek, selectWeeklyPlan } from '../../../core/stores/weeklyPlanStore';
import { optimizationHref, monitoringHref } from '../../../core/planning/operationalLinks';
import { optimizationDateHref, todayIso } from '../../../core/planning/planningUx';
import { WEEKDAY_LABELS } from '../../../core/planning/weeklyPlanCalendar';
import { weeklyPlanSavingPct } from '../../../core/planning/weeklyPlanUx';

interface WeeklyPlanOperationalSectionProps {
  planId: number;
  operationalPlan?: WeeklyOperationalPlan | null;
  /** Mejoras previstas de la semana (Fase 2); aporta la línea base para el ahorro. */
  forecast?: WeeklyPlanForecast | null;
}

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  void year;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function dayTotals(day: WeeklyPlanDayOperational): { km: number; min: number; stops: number } {
  const routes = day.vehicles ?? [];
  return {
    km: routes.reduce((sum, route) => sum + (route.distanceKm || 0), 0),
    min: routes.reduce((sum, route) => sum + (route.durationMin || 0), 0),
    stops: routes.reduce((sum, route) => sum + (route.stops || 0), 0),
  };
}

export function WeeklyPlanOperationalSection(props: WeeklyPlanOperationalSectionProps) {
  const navigate = useNavigate();
  const [running, setRunning] = createSignal(false);
  const [confirmAll, setConfirmAll] = createSignal(false);
  const [notifyingAll, setNotifyingAll] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [phase, setPhase] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal('');
  const [notifiedDays, setNotifiedDays] = createSignal<Set<string>>(new Set());
  const [notifyingDay, setNotifyingDay] = createSignal<string | null>(null);
  const [localPlan, setLocalPlan] = createSignal<WeeklyOperationalPlan | null>(null);
  /** Rotación de flota: ajuste global del motor (`algorithm_settings`), no de la corrida. */
  const [rotation, setRotation] = createSignal<boolean | null>(null);
  const [savingRotation, setSavingRotation] = createSignal(false);

  onMount(() => {
    void fetchAlgorithmSettings()
      .then((settings) => setRotation(settings.weeklyFleetRotation))
      .catch(() => setRotation(null));
  });

  const toggleRotation = async (next: boolean) => {
    const previous = rotation();
    setRotation(next);
    setSavingRotation(true);
    setError(null);
    setNotice('');
    try {
      const updated = await updateAlgorithmSettings({ weeklyFleetRotation: next });
      setRotation(updated.weeklyFleetRotation);
      setNotice(
        updated.weeklyFleetRotation
          ? 'Rotación de flota semanal activada: el plan repartirá los días entre los camiones.'
          : 'Rotación de flota semanal desactivada.',
      );
    } catch (err) {
      setRotation(previous);
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar la rotación de flota semanal',
      );
    } finally {
      setSavingRotation(false);
    }
  };

  createEffect(() => {
    if (props.operationalPlan) {
      setLocalPlan(props.operationalPlan);
    }
  });

  const plan = () => localPlan();
  const planDays = createMemo(() => plan()?.days ?? []);

  const vehicleCodes = createMemo(() => {
    const codes = new Set<string>();
    for (const day of planDays()) {
      for (const vehicle of day.vehicles ?? []) {
        codes.add(vehicle.vehicleCode);
      }
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b));
  });

  const optimizedDays = createMemo(() =>
    planDays().filter((day) => day.status === 'optimized' && day.dailyPlanId != null),
  );

  /**
   * Abre la planificación operativa del primer día con rutas generadas de la semana
   * (o del primer día de la semana si todavía no hay rutas).
   */
  const navigateToOperationalView = (days: WeeklyPlanDayOperational[]) => {
    const target = days.find((day) => day.dailyPlanId != null) ?? days[0];
    if (target?.operationDate) {
      navigate(
        optimizationHref({
          date: target.operationDate,
          dailyPlanId: target.dailyPlanId ?? undefined,
        }),
      );
      return;
    }
    navigate(optimizationDateHref(todayIso()));
  };

  const notifyAll = async () => {
    setNotifyingAll(true);
    setError(null);
    setNotice('');
    const eligible = optimizedDays().length;
    try {
      const response = await notifyWeeklyOperationalDays(props.planId);
      await selectWeeklyPlan(props.planId);
      if (response.count > 0) {
        setNotice(
          `${response.count} de ${Math.max(eligible, response.count)} día(s) notificado(s) a conductores.`,
        );
      } else {
        setNotice('No quedaban días optimizados por notificar.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo notificar la semana');
    } finally {
      setNotifyingAll(false);
      setConfirmAll(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setNotice('');
    setProgress(0);
    setPhase('Iniciando generación…');
    try {
      const days = await generateWeeklyOperationalPlanForWeek((value, phaseLabel) => {
        setProgress(value);
        setPhase(phaseLabel);
      });
      setProgress(100);
      setPhase('Plan operativo generado');
      setNotice('Rutas optimizadas para toda la semana. Abriendo la planificación operativa…');
      navigateToOperationalView(days.length > 0 ? days : planDays());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el plan operativo');
    } finally {
      setRunning(false);
    }
  };

  const notifyDay = async (day: WeeklyPlanDayOperational) => {
    if (!day.dailyPlanId) return;
    setNotifyingDay(day.operationDate);
    setError(null);
    setNotice('');
    try {
      await dispatchDailyPlan(day.dailyPlanId);
      setNotifiedDays((current) => new Set(current).add(day.operationDate));
      setNotice(
        `Día ${day.operationDate}: ${day.vehicles?.length ?? 0} ruta(s) notificada(s) a conductores.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo notificar el día');
    } finally {
      setNotifyingDay(null);
    }
  };

  return (
    <section
      class="space-y-3 rounded-xl border border-border bg-surface/40 p-4 dark:border-dark-border"
      data-testid="weekly-operational-section"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-start gap-2">
          <CalendarRange size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
          <div>
            <p class="text-sm font-semibold text-text-primary dark:text-white">
              Plan operativo de la semana
            </p>
            <p class="mt-0.5 text-xs text-text-muted">
              Genera las rutas de todos los días (Lun–Vie) en secuencia con el motor real, usando
              las zonas y la flota por tipo configuradas, y abre la planificación operativa del
              primer día. Luego notifica día a día.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Show when={optimizedDays().length > 0}>
            <Button
              variant="secondary"
              size="sm"
              class="gap-2"
              icon={notifyingAll() ? <RefreshCw size={14} class="animate-spin" /> : <Send size={14} />}
              disabled={running() || notifyingAll()}
              data-testid="weekly-notify-all"
              onClick={() => setConfirmAll(true)}
            >
              Notificar toda la semana
            </Button>
          </Show>
          <Show when={planDays().length === 0 || running()}>
            <Button
              variant="primary"
              size="sm"
              class="gap-2"
              icon={running() ? <RefreshCw size={14} class="animate-spin" /> : <Zap size={14} />}
              disabled={running()}
              data-testid="weekly-generate-operational"
              onClick={() => void run()}
            >
              Generar plan operativo de la semana
            </Button>
          </Show>
        </div>
      </div>

      <label
        class="flex items-start gap-2 rounded-lg border border-border bg-app/60 px-3 py-2 text-sm text-text-secondary dark:border-dark-border"
        data-testid="weekly-fleet-rotation"
      >
        <input
          type="checkbox"
          class="mt-0.5"
          checked={rotation() ?? false}
          disabled={rotation() === null || savingRotation() || running()}
          onChange={(event) => void toggleRotation(event.currentTarget.checked)}
        />
        <span>
          <span class="font-medium text-text-primary">Rotación de flota semanal</span>
          <span class="text-text-muted">
            {' '}
            — reparte los días de trabajo entre los camiones al generar el plan (Lun→Vie): quedan
            activos los que acumulan menos días y, a igualdad, los que no trabajaron el día anterior.
            Es lo que produce la evidencia de rotación del criterio AC-3 (≥ 6 vehículos distintos).
          </span>
        </span>
      </label>

      <Show when={confirmAll()}>
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50/90 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25"
          role="alertdialog"
          data-testid="weekly-notify-all-confirm"
        >
          <p class="text-sm text-amber-900 dark:text-amber-100">
            ¿Notificar {optimizedDays().length} día(s) optimizado(s) a los conductores? Esta acción
            envía las rutas a campo y no se puede deshacer por día.
          </p>
          <div class="flex gap-2">
            <Button size="sm" variant="primary" loading={notifyingAll()} onClick={() => void notifyAll()}>
              Sí, notificar todos
            </Button>
            <Button size="sm" variant="outline" disabled={notifyingAll()} onClick={() => setConfirmAll(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Show>

      <Show when={running()}>
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs text-text-muted">
            <span data-testid="weekly-operational-phase">{phase()}</span>
            <span>{progress()}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-elevated">
            <div
              class="h-full rounded-full bg-fero-green-dark transition-all"
              style={{ width: `${Math.max(4, progress())}%` }}
            />
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <p class="text-sm text-red-600 dark:text-red-300" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={notice()}>
        <p class="text-sm font-medium text-fero-green-dark dark:text-fero-green-mid">{notice()}</p>
      </Show>

      <Show when={planDays().length > 0}>
        <div class="overflow-x-auto">
          <table class="w-full min-w-180 text-sm" data-testid="weekly-operational-table">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="px-2 py-2 font-semibold">Camión</th>
                <For each={planDays()}>
                  {(day) => {
                    const notified = notifiedDays().has(day.operationDate);
                    const live = notified ? 'dispatched' : (day.status ?? '');
                    return (
                      <th class="px-2 py-2 text-center align-top font-semibold">
                        <div>{WEEKDAY_LABELS[day.weekday] ?? day.weekday}</div>
                        <div class="font-normal normal-case">{formatShortDate(day.operationDate)}</div>
                        <div class="mt-1 flex flex-wrap justify-center gap-1.5">
                          <A
                            href={optimizationHref({ date: day.operationDate })}
                            class="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-fero-blue hover:bg-surface-hover dark:border-dark-border"
                            data-testid={`weekly-open-day-${day.operationDate}`}
                          >
                            <ExternalLink size={10} /> Abrir día
                          </A>
                          <Show
                            when={
                              (live === 'dispatched' || live === 'closed') && day.dailyPlanId != null
                            }
                          >
                            <A
                              href={monitoringHref({
                                date: day.operationDate,
                                dailyPlanId: day.dailyPlanId!,
                              })}
                              class="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-fero-blue hover:bg-surface-hover dark:border-dark-border"
                              data-testid={`weekly-monitor-day-${day.operationDate}`}
                            >
                              <Radio size={10} /> Monitoreo
                            </A>
                          </Show>
                        </div>
                      </th>
                    );
                  }}
                </For>
              </tr>
            </thead>
            <tbody class="divide-y divide-border dark:divide-dark-border">
              <tr>
                <td class="px-2 py-1.5 text-xs text-text-muted">Estado</td>
                <For each={planDays()}>
                  {(day) => {
                    const notified = notifiedDays().has(day.operationDate);
                    const statusClass = notified || day.status === 'dispatched'
                      ? 'bg-fero-blue/15 text-fero-blue'
                      : day.status === 'closed'
                        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        : day.status === 'optimized'
                          ? 'bg-fero-green/15 text-fero-green-dark dark:text-fero-green'
                          : day.status === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
                    const statusLabel = notified || day.status === 'dispatched'
                      ? 'Notificado'
                      : day.status === 'closed'
                        ? 'Cerrado'
                        : day.status === 'optimized'
                          ? 'Optimizado'
                          : day.status === 'error'
                            ? 'Error'
                            : (day.status ?? '—');
                    return (
                      <td class="px-2 py-1.5 text-center">
                        <span class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                        <Show when={day.status === 'error' && day.error}>
                          <p class="mt-1 text-[10px] text-red-600 dark:text-red-300">{day.error}</p>
                        </Show>
                      </td>
                    );
                  }}
                </For>
              </tr>

              <Show when={vehicleCodes().length > 0}>
                <For each={vehicleCodes()}>
                  {(code) => (
                    <tr>
                      <td class="px-2 py-2">
                        <span class="inline-flex items-center gap-1.5 font-medium text-text-primary dark:text-white">
                          <Truck size={14} class="text-text-muted" /> {code}
                        </span>
                      </td>
                      <For each={planDays()}>
                        {(day) => {
                          const route = (day.vehicles ?? []).find((row) => row.vehicleCode === code);
                          return (
                            <td class="px-2 py-2 text-center align-top">
                              <Show when={route} fallback={<span class="text-text-muted">—</span>}>
                                {(r) => (
                                  <div class="text-xs leading-4 text-text-secondary">
                                    <p class="font-semibold text-text-primary dark:text-white">
                                      {r().distanceKm.toFixed(1)} km
                                    </p>
                                    <p>
                                      {Math.floor(r().durationMin / 60)} h {r().durationMin % 60} min
                                    </p>
                                    <p>{r().stops} pts</p>
                                  </div>
                                )}
                              </Show>
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                  )}
                </For>
              </Show>

              <tr class="bg-surface/60 dark:bg-dark-surface-hover/40">
                <td class="px-2 py-2 text-xs font-semibold text-text-primary dark:text-white">
                  Total día
                </td>
                <For each={planDays()}>
                  {(day) => {
                    const totals = dayTotals(day);
                    const hasRoutes =
                      day.status === 'optimized' || day.status === 'dispatched';
                    return (
                      <td class="px-2 py-2 text-center text-xs text-text-secondary">
                        <Show when={hasRoutes}>
                          <p class="font-semibold text-text-primary dark:text-white">
                            {totals.km.toFixed(1)} km
                          </p>
                          <p>
                            {Math.floor(totals.min / 60)} h {totals.min % 60} min
                          </p>
                          <p>{totals.stops} pts</p>
                        </Show>
                      </td>
                    );
                  }}
                </For>
              </tr>

              <tr>
                <td class="px-2 py-1.5 text-xs text-text-muted">Ahorro</td>
                <For each={planDays()}>
                  {(day) => {
                    const baseline =
                      props.forecast?.days?.[day.operationDate]?.baselineDistanceKm ?? null;
                    const saving = weeklyPlanSavingPct(baseline, day.distanceKm ?? null);
                    return (
                      <td class="px-2 py-1.5 text-center text-xs font-semibold text-fero-green-dark">
                        {saving != null ? `${saving.toFixed(1)}%` : '—'}
                      </td>
                    );
                  }}
                </For>
              </tr>
            </tbody>
          </table>

          <div class="mt-3 flex flex-wrap gap-2">
            <For each={planDays()}>
              {(day) => (
                <Show
                  when={
                    day.dailyPlanId != null &&
                    (day.status === 'optimized' || day.status === 'dispatched') &&
                    !notifiedDays().has(day.operationDate)
                  }
                >
                  <Button
                    size="sm"
                    variant="outline"
                    class="gap-1.5"
                    icon={<Send size={13} />}
                    disabled={notifyingDay() != null}
                    data-testid={`weekly-notify-day-${day.operationDate}`}
                    onClick={() => void notifyDay(day)}
                  >
                    Notificar {WEEKDAY_LABELS[day.weekday] ?? day.weekday} · {formatShortDate(day.operationDate)}
                  </Button>
                </Show>
              )}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}
