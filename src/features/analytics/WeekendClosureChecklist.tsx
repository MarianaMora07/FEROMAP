import { For, Show, createResource, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { Archive, CheckCircle2, Circle, ClipboardCheck } from 'lucide-solid';
import { Button, Card, CardHeader, Modal, ProgressBar } from '../../design-system/components';
import { archiveWeeklyPlan, fetchWeeklyPlans } from '../../core/api/planning';
import {
  fetchPlanningAnalytics,
  fetchPlanningDashboardSnapshot,
} from '../../core/api/planningAnalytics';
import {
  canArchiveWeeklyFromClosure,
  deriveWeekendClosureItems,
  isWeekendClosureWindow,
  weekendClosureProgress,
  weeklyPlanHref,
} from '../../core/planning/weekendClosureUx';

interface WeekendClosureChecklistProps {
  weekFrom: string;
  weekTo: string;
}

export function WeekendClosureChecklist(props: WeekendClosureChecklistProps) {
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [archiving, setArchiving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const [bundle, { refetch }] = createResource(
    () => ({ from: props.weekFrom, to: props.weekTo }),
    async ({ from, to }) => {
      const [analytics, snapshot, weeklyPlans] = await Promise.all([
        fetchPlanningAnalytics(from, to),
        fetchPlanningDashboardSnapshot(),
        fetchWeeklyPlans().then((res) => res.items),
      ]);
      return { analytics, snapshot, weeklyPlans };
    },
  );

  const items = () => {
    const data = bundle();
    if (!data) return [];
    return deriveWeekendClosureItems(data.analytics, data.snapshot, data.weeklyPlans);
  };

  const progress = () => weekendClosureProgress(items());
  const canArchive = () => {
    const data = bundle();
    if (!data) return false;
    return canArchiveWeeklyFromClosure(data.snapshot, items());
  };

  const handleArchive = async () => {
    const planId = bundle()?.snapshot?.weeklyPlan?.id;
    if (!planId) return;
    setArchiving(true);
    setError(null);
    setNotice(null);
    try {
      await archiveWeeklyPlan(planId);
      setNotice('Semana archivada correctamente.');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo archivar la semana');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Card class="border-fero-green/30 bg-fero-green/5">
        <CardHeader
          title="Checklist fin de semana"
          subtitle={
            isWeekendClosureWindow()
              ? 'Ventana de cierre — revisa cumplimiento antes de archivar'
              : 'Disponible todo el ciclo — recomendado los viernes'
          }
          action={
            <Button size="sm" variant="outline" class="gap-1.5" onClick={() => setOpen(true)}>
              <ClipboardCheck size={14} />
              Flujo guiado
            </Button>
          }
        />
        <Show
          when={!bundle.loading}
          fallback={<p class="text-sm text-text-muted">Cargando checklist…</p>}
        >
          <div class="mb-3 flex items-center gap-3">
            <ProgressBar value={progress()} color="green" class="flex-1" />
            <span class="text-sm font-semibold text-fero-green-dark">{progress()}%</span>
          </div>
          <ul class="space-y-2">
            <For each={items()}>
              {(item) => (
                <li class="flex items-start gap-2 text-sm">
                  <Show
                    when={item.done}
                    fallback={<Circle size={16} class="mt-0.5 shrink-0 text-text-muted" />}
                  >
                    <CheckCircle2 size={16} class="mt-0.5 shrink-0 text-fero-green-dark" />
                  </Show>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-text-primary dark:text-white">{item.label}</p>
                    <p class="text-xs text-text-secondary">{item.detail}</p>
                  </div>
                  <Show when={!item.done && item.actionHref}>
                    <A href={item.actionHref!} class="shrink-0 text-xs font-semibold text-fero-blue hover:underline">
                      {item.actionLabel}
                    </A>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={notice()}>
            <p class="mt-3 text-sm text-fero-green-dark">{notice()}</p>
          </Show>
        </Show>
      </Card>

      <Modal open={open()} onClose={() => setOpen(false)} title="Cierre de semana" size="lg">
        <div class="space-y-4">
          <p class="text-sm text-text-secondary">
            Cierra el loop <strong>planifiqué → ejecuté → mido</strong>. Completa cada punto antes de
            archivar la semana en el plan semanal.
          </p>
          <ul class="space-y-3">
            <For each={items()}>
              {(item) => (
                <li
                  class={`rounded-lg border px-3 py-3 ${
                    item.done
                      ? 'border-fero-green/40 bg-fero-green/10'
                      : 'border-border bg-surface dark:border-dark-border'
                  }`}
                >
                  <div class="flex items-start gap-2">
                    <Show
                      when={item.done}
                      fallback={<Circle size={18} class="mt-0.5 shrink-0 text-text-muted" />}
                    >
                      <CheckCircle2 size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
                    </Show>
                    <div class="flex-1">
                      <p class="font-semibold text-text-primary dark:text-white">{item.label}</p>
                      <p class="mt-0.5 text-sm text-text-secondary">{item.detail}</p>
                      <Show when={!item.done && item.actionHref}>
                        <Button
                          size="sm"
                          variant="outline"
                          class="mt-2"
                          onClick={() => {
                            setOpen(false);
                            navigate(item.actionHref!);
                          }}
                        >
                          {item.actionLabel}
                        </Button>
                      </Show>
                    </div>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <div class="rounded-lg border border-border bg-surface/60 px-3 py-3 dark:border-dark-border">
            <p class="text-sm font-medium text-text-primary dark:text-white">Archivar semana</p>
            <p class="mt-1 text-xs text-text-secondary">
              Disponible cuando la semana está aprobada y las jornadas están cerradas con pendientes
              resueltos.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                class="gap-1.5"
                icon={<Archive size={14} />}
                loading={archiving()}
                disabled={!canArchive()}
                onClick={() => void handleArchive()}
              >
                Archivar semana
              </Button>
              <Button variant="outline" onClick={() => { setOpen(false); navigate(weeklyPlanHref(bundle()?.snapshot?.weeklyPlan?.id)); }}>
                Ver plan semanal
              </Button>
            </div>
            <Show when={error()}>
              <p class="mt-2 text-sm text-red-500">{error()}</p>
            </Show>
            <Show when={notice()}>
              <p class="mt-2 text-sm text-fero-green-dark">{notice()}</p>
            </Show>
          </div>
        </div>
      </Modal>
    </>
  );
}
