import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, ArrowRight, CheckCircle2, MapPin, RefreshCw, Trash2 } from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
  KpiCard,
  LoadingPanel,
  ProgressBar,
} from '../../design-system/components';
import { fetchResidentOverview, fetchResidentProximity } from '../../core/api/resident';
import { authUser } from '../../core/stores/authStore';
import { deriveResidentFieldContext } from '../../core/resident/residentUx';
import {
  deriveNextResidentAction,
  getResidentQuickActions,
  residentServiceStatusLabel,
} from '../../core/resident/residentHubUx';
import { RESIDENT_EMPTY_PRESETS } from '../../core/resident/residentEmptyStates';
import { residentAlertsPreview } from '../../core/resident/residentAlertsUx';
import { residentAlertsHref } from '../../core/resident/residentDeepLinks';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { ResidentGlossaryStrip } from './ResidentGlossaryStrip';
import { ResidentRoutesSection } from './ResidentRoutesSection';
import { ResidentScheduleCard, ResidentScheduleStrip } from './ResidentScheduleCard';
import { ResidentTruckStatusCard } from './ResidentTruckStatusCard';

const toneClass = {
  warning: 'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  info: 'border-fero-blue/30 bg-gradient-to-r from-fero-blue/12 to-fero-blue/4',
  success: 'border-fero-green/40 bg-gradient-to-r from-fero-green/15 to-fero-green/5',
  error: 'border-red-300/60 bg-red-50/90 dark:border-red-900/40 dark:bg-red-950/25',
};

const titleClass = {
  warning: 'text-amber-800 dark:text-amber-200',
  info: 'text-fero-blue',
  success: 'text-fero-green-dark',
  error: 'text-red-700 dark:text-red-300',
};

const quickActionIcons = {
  map: MapPin,
  alerts: AlertTriangle,
  points: Trash2,
} as const;

function fillTone(level: number) {
  if (level >= 80) return 'red' as const;
  if (level >= 60) return 'amber' as const;
  return 'green' as const;
}

function relativeFrom(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 15) return 'hace un momento';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

interface ResidentHubSectionProps {
  variant?: 'dashboard' | 'landing';
}

export function ResidentHubSection(props: ResidentHubSectionProps) {
  const variant = () => props.variant ?? 'landing';
  let pendingOverviewForce = false;
  const loadOverview = () => {
    const force = pendingOverviewForce;
    pendingOverviewForce = false;
    return fetchResidentOverview({ force });
  };
  const [overview, { refetch: refetchOverview }] = createResource(loadOverview);
  const [proximity, { refetch: refetchProximity }] = createResource(fetchResidentProximity);
  const [nowMs, setNowMs] = createSignal(Date.now());

  const refetchAll = () => {
    pendingOverviewForce = true;
    void refetchOverview();
    void refetchProximity();
  };

  onMount(() => {
    const pollMs = 45_000;
    const clockMs = 15_000;
    const timer = window.setInterval(() => {
      void refetchProximity();
    }, pollMs);
    const clock = window.setInterval(() => setNowMs(Date.now()), clockMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetchProximity();
      }
    };
    const onExternalRefresh = () => refetchAll();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('feromap:resident-refresh', onExternalRefresh);
    onCleanup(() => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('feromap:resident-refresh', onExternalRefresh);
    });
  });

  const hubOverview = createMemo(() => {
    const data = overview();
    if (!data) return undefined;
    const liveProximity = proximity();
    return liveProximity ? { ...data, proximity: liveProximity } : data;
  });

  const context = createMemo(() =>
    deriveResidentFieldContext({
      overview: hubOverview(),
      user: authUser(),
    }),
  );

  const nextAction = createMemo(() =>
    deriveNextResidentAction(context(), { sectorId: authUser()?.sectorId }),
  );

  const quickActions = createMemo(() =>
    getResidentQuickActions({
      sectorId: authUser()?.sectorId,
      focus: context().phase === 'approaching' ? 'truck' : 'sector',
    }),
  );

  const sectorAlertsPreview = createMemo(() => {
    const data = hubOverview();
    if (!data) return [];
    return residentAlertsPreview(data, [], 3);
  });

  const showRouteTable = () =>
    context().hasSector && (overview()?.activeRoutesInSector.length ?? 0) > 0;

  /** Solo bloquea el primer paint; el refresco de 45 s no oculta el contenido. */
  const initialLoading = () => !overview() && (overview.loading || proximity.loading);
  const backgroundSync = () =>
    Boolean(overview() || proximity()) && (overview.loading || proximity.loading);

  const lastUpdatedLabel = createMemo(() => {
    const iso = proximity()?.lastUpdatedAt ?? hubOverview()?.proximity?.lastUpdatedAt;
    if (!iso) return null;
    return relativeFrom(iso, nowMs());
  });

  const isStale = createMemo(() => {
    const iso = proximity()?.lastUpdatedAt;
    if (!iso) return false;
    return nowMs() - new Date(iso).getTime() > 90_000;
  });

  return (
    <section class="space-y-4" data-testid="resident-hub">
      <div class="relative h-0.5 overflow-hidden rounded-full bg-fero-blue/10" aria-hidden="true">
        <Show when={backgroundSync() || initialLoading()}>
          <div class="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-fero-blue" />
        </Show>
      </div>

      <Show when={variant() === 'dashboard'}>
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">Mi zona</p>
            <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">
              Mi Recolección
            </h2>
            <p class="mt-1 text-sm text-text-secondary">
              Horario, camión y contenedores de tu sector — consulta ciudadana.
            </p>
          </div>
          <A href="/resident" class="text-sm font-medium text-fero-blue hover:underline">
            Ver hub completo
          </A>
        </div>
      </Show>

      <Show when={initialLoading()}>
        <Card aria-busy="true" class="fero-rise">
          <LoadingPanel label="Cargando tu sector…" indeterminate />
        </Card>
      </Show>

      <Show when={overview.error}>
        <PlanningEmptyState
          {...RESIDENT_EMPTY_PRESETS.noSectorAssigned}
          description="No se pudo cargar la información del residente. Verifica que tu cuenta tenga sector asignado."
        />
      </Show>

      <Show when={!initialLoading() && !overview.error && overview()}>
        {(data) => (
          <>
            <Show when={!context().hasSector}>
              <PlanningEmptyState {...RESIDENT_EMPTY_PRESETS.noSectorAssigned} />
            </Show>

            <Show when={context().hasSector}>
              <Show when={variant() === 'dashboard' && data().schedule.hasSchedule}>
                <ResidentScheduleStrip
                  sectorName={context().sectorName}
                  schedule={data().schedule}
                />
              </Show>

              <div
                role="status"
                aria-live="polite"
                class={`fero-rise rounded-xl border px-4 py-4 shadow-sm ring-1 ring-black/5 dark:ring-white/5 ${toneClass[nextAction().tone]}`}
                data-testid="resident-next-action"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Qué hacer ahora
                  </p>
                  <Show when={lastUpdatedLabel()}>
                    <span
                      class={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                        isStale() ? 'text-amber-600 dark:text-amber-300' : 'text-text-muted'
                      }`}
                    >
                      <span
                        class={`h-1.5 w-1.5 rounded-full ${
                          isStale()
                            ? 'bg-amber-500'
                            : 'animate-pulse bg-fero-green'
                        }`}
                        aria-hidden="true"
                      />
                      {isStale() ? 'Datos retrasados' : 'En vivo'} · {lastUpdatedLabel()}
                    </span>
                  </Show>
                </div>
                <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class={`text-lg font-bold ${titleClass[nextAction().tone]}`}>
                      {nextAction().message}
                    </p>
                    <p class="mt-1 text-sm text-text-secondary">{nextAction().detail}</p>
                  </div>
                  <Show when={nextAction().href && nextAction().label}>
                    <A href={nextAction().href} class="shrink-0">
                      <Button
                        variant={nextAction().tone === 'warning' ? 'primary' : 'gradient'}
                        class="w-full gap-2 sm:w-auto"
                      >
                        {nextAction().label}
                        <ArrowRight size={14} />
                      </Button>
                    </A>
                  </Show>
                </div>
              </div>

              <div class="grid gap-4 lg:grid-cols-2">
                <Show when={variant() !== 'dashboard'}>
                  <div class="fero-rise fero-rise-delay-1">
                    <ResidentScheduleCard
                      sectorName={context().sectorName}
                      schedule={data().schedule}
                    />
                  </div>
                </Show>
                <div class="fero-rise fero-rise-delay-2">
                  <ResidentTruckStatusCard context={context()} sectorId={authUser()?.sectorId} />
                </div>
              </div>

              <div
                class="flex flex-wrap gap-2"
                data-testid="resident-quick-actions"
              >
                <For each={quickActions()}>
                  {(item) => {
                    const Icon = quickActionIcons[item.id];
                    return (
                      <A
                        href={item.href}
                        class="rounded-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <Button variant="outline" size="sm" class="gap-2">
                          <Icon size={14} />
                          {item.label}
                        </Button>
                      </A>
                    );
                  }}
                </For>
              </div>

              <Show when={showRouteTable()}>
                <ResidentRoutesSection routes={data().activeRoutesInSector} />
              </Show>

              <Card class="fero-rise fero-rise-delay-1" data-testid="resident-containers-section">
                <CardHeader title="Contenedores en mi sector" subtitle={context().sectorName} />
                <Show
                  when={data().collectionPoints.length > 0}
                  fallback={
                    <PlanningEmptyState {...RESIDENT_EMPTY_PRESETS.noContainersInSector} compact />
                  }
                >
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={data().collectionPoints}>
                      {(point) => (
                        <div class="rounded-lg border border-border p-3 transition-shadow hover:shadow-sm dark:border-dark-border">
                          <div class="mb-2 flex items-center justify-between gap-2">
                            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary dark:text-white">
                              <Trash2 size={14} class="text-fero-green-dark" />
                              {point.id}
                            </span>
                            <span class="text-xs font-semibold text-text-muted">
                              {point.fillLevel}%
                            </span>
                          </div>
                          <ProgressBar
                            value={point.fillLevel}
                            color={fillTone(point.fillLevel)}
                            size="sm"
                          />
                          <p class="mt-2 text-xs text-text-muted">{point.address}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Card>

              <Card data-testid="resident-sector-kpis">
                <CardHeader
                  title="Resumen del sector"
                  subtitle={context().sectorName}
                  action={
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
                      onClick={refetchAll}
                      disabled={backgroundSync()}
                    >
                      <RefreshCw size={12} class={backgroundSync() ? 'animate-spin' : undefined} />
                      {backgroundSync() ? 'Actualizando…' : 'Actualizar'}
                    </button>
                  }
                />
                <div class="grid gap-4 md:grid-cols-3">
                  <KpiCard
                    title="Puntos de recolección"
                    value={String(context().stats.totalPoints)}
                    iconTone="blue"
                    footer={<span class="text-xs text-text-muted">En tu barrio</span>}
                  />
                  <KpiCard
                    title="Contenedores críticos"
                    value={String(context().stats.criticalPoints)}
                    iconTone="red"
                    footer={<span class="text-xs text-text-muted">Nivel ≥ 80 %</span>}
                  />
                  <KpiCard
                    title="Estado del servicio"
                    value={residentServiceStatusLabel(context())}
                    iconTone="green"
                    footer={
                      <span class="text-xs text-text-muted">
                        {context().stats.routesServingSector} ruta(s) activa(s)
                      </span>
                    }
                  />
                </div>
              </Card>

              <Show
                when={sectorAlertsPreview().length > 0}
                fallback={
                  <Card data-testid="resident-no-alerts-card">
                    <CardHeader title="Avisos de tu sector" />
                    <div class="flex items-start gap-3 rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-3">
                      <CheckCircle2 size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
                      <div>
                        <p class="text-sm font-semibold text-fero-green-dark">
                          Sin avisos en tu sector
                        </p>
                        <p class="text-sm text-text-secondary">
                          No hay alertas que afecten tu barrio en este momento.
                        </p>
                        <A
                          href={residentAlertsHref()}
                          class="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
                        >
                          Ver alertas del sector
                          <ArrowRight size={14} />
                        </A>
                      </div>
                    </div>
                  </Card>
                }
              >
                <Card>
                  <CardHeader title="Avisos de tu sector" />
                  <ul class="space-y-2">
                    <For each={sectorAlertsPreview()}>
                      {(alert) => (
                        <li class="flex gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-hover dark:border-dark-border">
                          <AlertTriangle size={16} class="mt-0.5 shrink-0 text-fero-blue" />
                          <div>
                            <p class="font-medium text-text-primary dark:text-white">
                              {alert.title}
                            </p>
                            <p class="text-text-muted">{alert.detail}</p>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                  <A
                    href={residentAlertsHref()}
                    class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
                  >
                    Ver todas las alertas
                    <ArrowRight size={14} />
                  </A>
                </Card>
              </Show>
            </Show>
          </>
        )}
      </Show>

      <Show when={variant() === 'landing' && context().hasSector}>
        <ResidentGlossaryStrip />
      </Show>
    </section>
  );
}
