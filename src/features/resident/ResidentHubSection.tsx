import { For, Show, createMemo, createResource, onCleanup, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, ArrowRight, MapPin, Trash2 } from 'lucide-solid';
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
  info: 'border-fero-blue/30 bg-fero-blue/10',
  success: 'border-fero-green/40 bg-fero-green/10',
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

interface ResidentHubSectionProps {
  variant?: 'dashboard' | 'landing';
}

export function ResidentHubSection(props: ResidentHubSectionProps) {
  const variant = () => props.variant ?? 'landing';
  const [overview, { refetch: refetchOverview }] = createResource(fetchResidentOverview);
  const [proximity, { refetch: refetchProximity }] = createResource(fetchResidentProximity);

  onMount(() => {
    const pollMs = 45_000;
    const timer = window.setInterval(() => {
      void refetchProximity();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetchProximity();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    onCleanup(() => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
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

  const handleRefresh = () => {
    void refetchOverview();
    void refetchProximity();
  };

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

  const loading = () => overview.loading || proximity.loading;

  return (
    <section class="space-y-4" data-testid="resident-hub">
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
        <Show when={variant() === 'dashboard'}>
          <A href="/resident" class="text-sm font-medium text-fero-blue hover:underline">
            Ver hub completo
          </A>
        </Show>
      </div>

      <Show when={loading()}>
        <Card aria-busy="true">
          <LoadingPanel label="Cargando tu sector…" indeterminate />
        </Card>
      </Show>

      <Show when={overview.error}>
        <PlanningEmptyState
          {...RESIDENT_EMPTY_PRESETS.noSectorAssigned}
          description="No se pudo cargar la información del residente. Verifica que tu cuenta tenga sector asignado."
        />
      </Show>

      <Show when={!loading() && !overview.error && overview()}>
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
                class={`rounded-xl border px-4 py-4 shadow-sm ring-1 ring-black/5 dark:ring-white/5 ${toneClass[nextAction().tone]}`}
                data-testid="resident-next-action"
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Qué hacer ahora
                </p>
                <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class={`text-lg font-bold ${titleClass[nextAction().tone]}`}>
                      {nextAction().message}
                    </p>
                    <p class="mt-1 text-sm text-text-secondary">{nextAction().detail}</p>
                  </div>
                  <Show when={nextAction().href && nextAction().label}>
                    <A href={nextAction().href}>
                      <Button
                        variant={nextAction().tone === 'warning' ? 'primary' : 'outline'}
                        class="gap-2 shrink-0"
                      >
                        {nextAction().label}
                        <ArrowRight size={14} />
                      </Button>
                    </A>
                  </Show>
                </div>
              </div>

              <div class="flex flex-col gap-4 lg:grid lg:grid-cols-2">
                <Show when={variant() !== 'dashboard'}>
                  <ResidentScheduleCard sectorName={context().sectorName} schedule={data().schedule} />
                </Show>
                <ResidentTruckStatusCard context={context()} sectorId={authUser()?.sectorId} />
              </div>

              <div class="flex flex-wrap gap-2" data-testid="resident-quick-actions">
                <For each={quickActions()}>
                  {(item) => {
                    const Icon = quickActionIcons[item.id];
                    return (
                      <A href={item.href}>
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

              <Card data-testid="resident-containers-section">
                <CardHeader title="Contenedores en mi sector" subtitle={context().sectorName} />
                <Show
                  when={data().collectionPoints.length > 0}
                  fallback={<PlanningEmptyState {...RESIDENT_EMPTY_PRESETS.noContainersInSector} compact />}
                >
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={data().collectionPoints}>
                      {(point) => (
                        <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                          <div class="mb-2 flex items-center justify-between gap-2">
                            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary dark:text-white">
                              <Trash2 size={14} class="text-fero-green-dark" />
                              {point.id}
                            </span>
                            <span class="text-xs font-semibold text-text-muted">{point.fillLevel}%</span>
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
                      class="text-xs font-medium text-fero-blue hover:underline"
                      onClick={handleRefresh}
                    >
                      Actualizar
                    </button>
                  }
                />
                <div class="grid gap-4 md:grid-cols-3">
                  <KpiCard
                    title="Puntos de recolección"
                    value={String(context().stats.totalPoints)}
                    iconTone="blue"
                    footer={
                      <span class="text-xs text-text-muted">En tu barrio</span>
                    }
                  />
                  <KpiCard
                    title="Contenedores críticos"
                    value={String(context().stats.criticalPoints)}
                    iconTone="red"
                    footer={
                      <span class="text-xs text-text-muted">Nivel ≥ 80 %</span>
                    }
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

              <Show when={sectorAlertsPreview().length > 0}>
                <Card>
                  <CardHeader title="Avisos de tu sector" />
                  <ul class="space-y-2">
                    <For each={sectorAlertsPreview()}>
                      {(alert) => (
                        <li class="flex gap-2 rounded-md border border-border px-3 py-2 text-sm dark:border-dark-border">
                          <AlertTriangle size={16} class="mt-0.5 shrink-0 text-fero-blue" />
                          <div>
                            <p class="font-medium text-text-primary dark:text-white">{alert.title}</p>
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
