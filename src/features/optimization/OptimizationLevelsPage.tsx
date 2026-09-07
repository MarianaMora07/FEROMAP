import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { ArrowLeft, Download, FileText, Play, Route } from 'lucide-solid';
import { Button, Card, CardHeader, SelectField } from '../../design-system/components';
import { daySimKm, dayStatusMeta, hasDayPoints } from './optimizationLevelsUx';
import { fetchScenarios, downloadSimulationExport } from '../../core/api/simulation';
import type { ScenarioId } from '../../data/types/simulation';
import {
  fetchSimulationOptimizeJob,
  startSimulationOptimizeJob,
  type OptimizeJobResult,
} from '../../core/api/simulationJobs';
import {
  fetchWeeklyDayPlan,
  fetchWeeklyPlanById,
  fetchWeeklyPlans,
  type WeeklyDayPlan,
  type WeeklyDayPoint,
  type WeeklyPlan,
  type WeeklyPlanDay,
} from '../../core/api/planning';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DEPARTURE_HOURS = [
  { value: '6', label: '06:00 — Pico mañana (×1.30)' },
  { value: '7', label: '07:00 — Pico mañana (×1.30)' },
  { value: '9', label: '09:00 — Valle (×1.00)' },
  { value: '12', label: '12:00 — Valle (×1.00)' },
  { value: '14', label: '14:00 — Valle (×1.00)' },
  { value: '17', label: '17:00 — Pico tarde (×1.25)' },
];
const DURATIONS = [
  { value: '6', label: '6 horas' },
  { value: '8', label: '8 horas' },
  { value: '10', label: '10 horas' },
  { value: '12', label: '12 horas' },
];

function mondayIso(reference: Date = new Date()): string {
  const copy = new Date(reference);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy.toISOString().slice(0, 10);
}

function fmt(value: number | null | undefined, suffix = ''): string {
  return value == null ? '—' : `${Number(value).toFixed(1)}${suffix}`;
}

export default function OptimizationLevelsPage() {
  const [searchParams] = useSearchParams();
  const firstParam = (value: string | string[] | undefined): string | null =>
    Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  const deepDate = () => firstParam(searchParams.operationDate);
  const deepWeek = () => firstParam(searchParams.weekStart);

  const [weeks] = createResource(() => fetchWeeklyPlans());
  const [weekId, setWeekId] = createSignal<number | null>(null);
  const [operationDate, setOperationDate] = createSignal<string | null>(deepDate());
  const [level, setLevel] = createSignal(deepDate() ? 2 : 1);

  const [plan, setPlan] = createSignal<WeeklyPlan | null>(null);
  const [dayPlan, setDayPlan] = createSignal<WeeklyDayPlan | null>(null);

  createEffect(() => {
    const rows = weeks()?.items;
    if (!rows || rows.length === 0 || weekId() != null) return;
    const target = deepWeek() ?? mondayIso();
    const match =
      rows.find((row) => row.weekStartDate === target) ??
      rows.find((row) => row.status === 'approved' && row.weekStartDate === mondayIso()) ??
      rows[0];
    if (match) setWeekId(match.id);
  });

  createEffect(() => {
    const id = weekId();
    if (id == null) {
      setPlan(null);
      return;
    }
    let live = true;
    void fetchWeeklyPlanById(id)
      .then((fetched) => {
        if (live) setPlan(fetched);
      })
      .catch(() => undefined);
    onCleanup(() => {
      live = false;
    });
  });

  createEffect(() => {
    const date = operationDate();
    const id = weekId();
    if (level() < 2 || id == null || date == null) {
      setDayPlan(null);
      return;
    }
    let live = true;
    void fetchWeeklyDayPlan(id, date)
      .then((fetched) => {
        if (live) setDayPlan(fetched);
      })
      .catch(() => undefined);
    onCleanup(() => {
      live = false;
    });
  });

  const currentPlan = () => plan();

  const openDay = (day: WeeklyPlanDay) => {
    setOperationDate(day.operationDate);
    setLevel(2);
  };

  // N3 — simulación del día
  const [simScenario, setSimScenario] = createSignal('normal');
  const [simDeparture, setSimDeparture] = createSignal('9');
  const [simDuration, setSimDuration] = createSignal('12');
  const [simAnts, setSimAnts] = createSignal('12');
  const [simIterations, setSimIterations] = createSignal('20');
  const [simRunning, setSimRunning] = createSignal(false);
  const [simError, setSimError] = createSignal<string | null>(null);
  const [simResult, setSimResult] = createSignal<OptimizeJobResult | null>(null);
  const [scenarios] = createResource(() => fetchScenarios());

  const dayPoints = createMemo<number[]>(() => dayPlan()?.points.map((point) => point.id) ?? []);

  const runSimulation = async () => {
    const points = dayPoints();
    if (points.length === 0 || weekId() == null) return;
    setSimRunning(true);
    setSimError(null);
    setSimResult(null);
    try {
      const { jobId } = await startSimulationOptimizeJob(simScenario() as ScenarioId, {
        collectionPointIds: points,
        departureHour: Number(simDeparture()),
        estimatedDurationHours: Number(simDuration()),
        acoAnts: Number(simAnts()),
        acoIterations: Number(simIterations()),
      });
      for (let attempts = 0; attempts < 1200; attempts += 1) {
        const snapshot = await fetchSimulationOptimizeJob(jobId);
        if (snapshot.status === 'completed' && snapshot.result) {
          setSimResult(snapshot.result);
          return;
        }
        if (snapshot.status === 'failed') throw new Error(snapshot.error ?? 'La simulación falló');
        if (snapshot.status === 'cancelled') throw new Error('Simulación cancelada');
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      throw new Error('La simulación tardó demasiado');
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Error al simular');
    } finally {
      setSimRunning(false);
    }
  };

  const kpis = () => simResult()?.kpis;

  return (
    <div class="space-y-5" data-testid="optimization-levels-page">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary dark:text-white">
            Optimización en 3 niveles
          </h2>
          <p class="text-sm text-text-secondary">Semana → Día → Simulación del recorrido</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <Show when={level() >= 1 && currentPlan()}>
            <button class="hover:text-fero-blue" onClick={() => setLevel(1)}>
              Semana {currentPlan()?.weekStartDate}
            </button>
          </Show>
          <Show when={level() >= 2}>
            <span>›</span>
            <button class="hover:text-fero-blue" onClick={() => setLevel(2)}>
              Día {operationDate()}
            </button>
          </Show>
          <Show when={level() >= 3}>
            <span>›</span>
            <span class="font-medium text-text-primary dark:text-white">Simulación</span>
          </Show>
        </div>
        <Show when={level() > 1}>
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            icon={<ArrowLeft size={14} />}
            onClick={() => {
              setLevel(level() - 1);
              setSimResult(null);
              setSimError(null);
            }}
          >
            Volver
          </Button>
        </Show>
      </div>

      {/* N1 — Tabla de la semana */}
      <Show when={level() === 1}>
        <Card>
          <CardHeader title="Plan de la semana" subtitle="Selecciona una semana y elige un día para ver su recorrido" />
          <div class="mb-4 max-w-sm">
            <SelectField
              label="Semana"
              value={String(currentPlan()?.id ?? '')}
              onChange={(event) => setWeekId(Number((event.currentTarget as HTMLSelectElement).value))}
            >
              <For each={weeks()?.items ?? []}>
                {(item) => (
                  <option value={String(item.id)}>
                    {item.weekStartDate} · {item.status}
                  </option>
                )}
              </For>
            </SelectField>
          </div>
          <Show when={!currentPlan() && (weeks()?.items?.length ?? 0) === 0}>
            <p class="mb-3 text-sm text-text-muted">
              No hay planes semanales. Crea uno en Plan semanal antes de usar esta vista.
            </p>
          </Show>
          <div class="overflow-x-auto">
            <table class="w-full min-w-140 text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                  <th class="px-3 py-2 font-semibold">Día</th>
                  <th class="px-3 py-2 font-semibold">Fecha</th>
                  <th class="px-3 py-2 font-semibold">Puntos</th>
                  <th class="px-3 py-2 font-semibold">Vehículos</th>
                  <th class="px-3 py-2 font-semibold">Km (validación)</th>
                  <th class="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <Show
                  when={(currentPlan()?.days?.length ?? 0) > 0}
                  fallback={
                    <tr>
                      <td colspan={6} class="px-3 py-6 text-center text-sm text-text-muted">
                        La semana no tiene días configurados.
                      </td>
                    </tr>
                  }
                >
                  <For each={currentPlan()?.days ?? []}>
                    {(day) => {
                      const status = dayStatusMeta(day, currentPlan()!);
                      return (
                        <tr class="cursor-pointer hover:bg-surface-hover" onClick={() => openDay(day)}>
                          <td class="px-3 py-2.5 font-medium text-text-primary dark:text-white">
                            {WEEKDAY_LABELS[day.weekday] ?? day.weekday}
                          </td>
                          <td class="px-3 py-2.5 text-text-secondary">{day.operationDate}</td>
                          <td class="px-3 py-2.5">{day.collectionPointIds.length}</td>
                          <td class="px-3 py-2.5">{day.expectedVehicleCount ?? '—'}</td>
                          <td class="px-3 py-2.5">{daySimKm(currentPlan(), day.operationDate)}</td>
                          <td class="px-3 py-2.5">
                            <span class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </Card>
      </Show>

      {/* N2 — Plan del día */}
      <Show when={level() === 2 && dayPlan()}>
        {(day) => (
          <div class="space-y-4">
            <Card>
              <CardHeader
                title={`${WEEKDAY_LABELS[day().weekday] ?? ''} ${day().operationDate}`}
                subtitle={`Escenario: ${day().scenarioId} · Flota esperada: ${
                  day().expectedVehicleCount ?? '—'
                } vehículos · Origen: ${day().pointSource ?? 'manual'}`}
              />
              <Show when={day().simulation}>
                {(sim) => (
                  <div class="mb-3 flex flex-wrap gap-4 rounded-lg border border-border bg-elevated/40 px-4 py-2.5 text-sm dark:border-dark-border">
                    <span>Km: <b>{fmt(sim().distanceKm)}</b></span>
                    <span>Duración: <b>{fmt(sim().durationHours, ' h')}</b></span>
                    <span>Cobertura: <b>{fmt(sim().coveragePct, '%')}</b></span>
                    <span
                      class={
                        sim().feasible === false || sim().error
                          ? 'font-semibold text-red-600'
                          : 'font-semibold text-fero-green-dark'
                      }
                    >
                      {sim().error ?? (sim().feasible === false ? 'Revisar' : 'Factible')}
                    </span>
                  </div>
                )}
              </Show>
              <div class="overflow-x-auto">
                <table class="w-full min-w-130 text-sm">
                  <thead>
                    <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                      <th class="px-3 py-2 font-semibold">Código</th>
                      <th class="px-3 py-2 font-semibold">Sector</th>
                      <th class="px-3 py-2 font-semibold">Llenado</th>
                      <th class="px-3 py-2 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border dark:divide-dark-border">
                    <Show
                      when={day().points.length > 0}
                      fallback={
                        <tr>
                          <td colspan={4} class="px-3 py-6 text-center text-sm text-text-muted">
                            El día no tiene puntos asignados. Edita la asignación o autocompleta la semana.
                          </td>
                        </tr>
                      }
                    >
                      <For each={day().points}>
                        {(point: WeeklyDayPoint) => (
                          <tr>
                            <td class="px-3 py-2 font-medium text-text-primary dark:text-white">{point.code}</td>
                            <td class="px-3 py-2 text-text-secondary">{point.sector ?? '—'}</td>
                            <td class="px-3 py-2">{point.fillLevelPct != null ? `${point.fillLevelPct}%` : '—'}</td>
                            <td class="px-3 py-2">{point.active === false ? 'Inactivo' : 'Activo'}</td>
                          </tr>
                        )}
                      </For>
                    </Show>
                  </tbody>
                </table>
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  class="gap-2"
                  icon={<Play size={15} />}
                  disabled={!hasDayPoints(day())}
                  onClick={() => {
                    setSimScenario(day().scenarioId ?? 'normal');
                    setLevel(3);
                  }}
                >
                  Simular este día
                </Button>
                <A href={`/planning/weekly`}>
                  <Button variant="outline" size="sm">
                    Editar asignación
                  </Button>
                </A>
              </div>
            </Card>
          </div>
        )}
      </Show>

      {/* N3 — Simulación del día */}
      <Show when={level() === 3 && dayPlan()}>
        {(day) => (
          <Card>
            <CardHeader
              title={`Simular ${day().operationDate} (${day().points.length} puntos)`}
              subtitle="La simulación no altera el plan operativo; se guarda en el historial."
            />
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Escenario" value={simScenario()} onChange={(e) => setSimScenario((e.currentTarget as HTMLSelectElement).value)}>
                <For each={scenarios() ?? []}>{(item) => <option value={item.id}>{item.label}</option>}</For>
              </SelectField>
              <SelectField label="Hora de salida" value={simDeparture()} onChange={(e) => setSimDeparture((e.currentTarget as HTMLSelectElement).value)}>
                <For each={DEPARTURE_HOURS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
              </SelectField>
              <SelectField label="Jornada" value={simDuration()} onChange={(e) => setSimDuration((e.currentTarget as HTMLSelectElement).value)}>
                <For each={DURATIONS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
              </SelectField>
              <SelectField label="Hormigas (ACO)" value={simAnts()} onChange={(e) => setSimAnts((e.currentTarget as HTMLSelectElement).value)}>
                <For each={['6', '12', '20']}>{(value) => <option value={value}>{value}</option>}</For>
              </SelectField>
              <SelectField label="Iteraciones (ACO)" value={simIterations()} onChange={(e) => setSimIterations((e.currentTarget as HTMLSelectElement).value)}>
                <For each={['10', '20', '40']}>{(value) => <option value={value}>{value}</option>}</For>
              </SelectField>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button variant="gradient" class="gap-2" icon={<Play size={15} />} loading={simRunning()} onClick={() => void runSimulation()}>
                Ejecutar simulación
              </Button>
            </div>
            <Show when={simError()}>
              <p class="mt-3 text-sm text-red-600">{simError()}</p>
            </Show>
            <Show when={kpis()}>
              {(kp) => {
                const distance = kp().distanceKm;
                const saving = distance.current > 0 ? ((1 - distance.optimized / distance.current) * 100).toFixed(1) : '0.0';
                return (
                  <div class="mt-4 space-y-3 border-t border-border pt-4 dark:border-dark-border">
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                        <p class="text-[11px] uppercase tracking-wide text-text-muted">Distancia actual</p>
                        <p class="text-lg font-bold">{distance.current.toFixed(1)} km</p>
                      </div>
                      <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                        <p class="text-[11px] uppercase tracking-wide text-text-muted">Distancia IA</p>
                        <p class="text-lg font-bold text-fero-green-dark dark:text-fero-green-mid">
                          {distance.optimized.toFixed(1)} km
                        </p>
                      </div>
                      <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                        <p class="text-[11px] uppercase tracking-wide text-text-muted">Ahorro</p>
                        <p class="text-lg font-bold">{saving}%</p>
                      </div>
                      <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                        <p class="text-[11px] uppercase tracking-wide text-text-muted">CO₂ evitado</p>
                        <p class="text-lg font-bold">{fmt(kp().co2KgAvoided, ' kg')}</p>
                      </div>
                    </div>
                    <p class="text-[11px] text-text-muted">
                      Nota metodológica: la ruta "actual/histórica" es la línea base sintética (orden por código).
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Show when={simResult()?.simulationId != null}>
                        <A href={`/simulation?simulationId=${simResult()!.simulationId}`}>
                          <Button variant="outline" size="sm" class="gap-2" icon={<Route size={14} />}>
                            Ver en simulación
                          </Button>
                        </A>
                        <Button
                          variant="outline"
                          size="sm"
                          class="gap-2"
                          icon={<Download size={14} />}
                          onClick={() => void downloadSimulationExport('csv', simResult()!.simulationId)}
                        >
                          CSV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          class="gap-2"
                          icon={<FileText size={14} />}
                          onClick={() => void downloadSimulationExport('pdf', simResult()!.simulationId)}
                        >
                          PDF
                        </Button>
                      </Show>
                      <A href={`/optimization?date=${day().operationDate}`}>
                        <Button variant="outline" size="sm">
                          Ir al despacho operativo
                        </Button>
                      </A>
                    </div>
                  </div>
                );
              }}
            </Show>
          </Card>
        )}
      </Show>
    </div>
  );
}
