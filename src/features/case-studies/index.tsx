import { Copy, Layers, Play, Plus, Search } from 'lucide-solid';
import { A, useNavigate } from '@solidjs/router';
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import {
  createCaseStudy,
  duplicateCaseStudy,
  fetchCaseStudies,
  type CaseStudyListItem,
} from '../../core/api/caseStudies';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { simulationCaseStudyHref } from '../../core/utils/simulationLinks';
import type { CaseStudyStatus } from '../../data/types/caseStudy';
import { Badge, Button, Card, TextField } from '../../design-system/components';
import { CaseStudyCreateModal } from './CaseStudyCreateModal';

const STATUS_LABELS: Record<CaseStudyStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  archived: 'Archivado',
};

function statusBadgeVariant(status: CaseStudyStatus): 'default' | 'success' | 'warning' {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'warning';
  return 'default';
}

function isCaseStudyDemoVisible(item: CaseStudyListItem): boolean {
  return item.defaultParameters?.demoVisible !== false;
}

export default function CaseStudiesListPage() {
  const navigate = useNavigate();
  const [items, setItems] = createSignal<CaseStudyListItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [query, setQuery] = createSignal('');
  const [modalOpen, setModalOpen] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [alertMsg, setAlertMsg] = createSignal('');
  const [alertType, setAlertType] = createSignal<'error' | 'success'>('error');

  const canManage = () => canOptimize(authUser()?.role);

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return items();
    return items().filter(
      (item) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q),
    );
  });

  const showAlert = (type: 'error' | 'success', message: string) => {
    setAlertType(type);
    setAlertMsg(message);
    setTimeout(() => setAlertMsg(''), 5000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchCaseStudies({ limit: 100 });
      setItems(response.items);
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudieron cargar los casos');
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void load());

  const handleCreate = async (payload: Parameters<typeof createCaseStudy>[0]) => {
    setSubmitting(true);
    try {
      const created = await createCaseStudy(payload);
      setModalOpen(false);
      showAlert('success', `Caso ${created.code} creado`);
      navigate(`/case-studies/${created.id}`);
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudo crear el caso');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (item: CaseStudyListItem) => {
    setSubmitting(true);
    try {
      const clone = await duplicateCaseStudy(item.id, {
        code: `${item.code}-COPY`,
        name: `${item.name} (copia)`,
      });
      showAlert('success', `Duplicado como ${clone.code}`);
      await load();
      navigate(`/case-studies/${clone.id}`);
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudo duplicar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="mb-1 flex items-center gap-2 text-fero-green-dark">
            <Layers size={20} />
            <span class="text-xs font-semibold uppercase tracking-wide">Planificador</span>
          </div>
          <h1 id="page-title" class="font-heading text-2xl font-bold text-text-primary dark:text-white">Casos de estudio</h1>
          <p class="mt-1 max-w-2xl text-sm text-text-muted">
            Arma escenarios académicos aislados: subconjuntos de puntos y condiciones locales sin alterar el catálogo
            operativo.
          </p>
        </div>
        <Show when={canManage()}>
          <Button type="button" size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
            Nuevo caso
          </Button>
        </Show>
      </div>

      <Show when={alertMsg()}>
        <div
          data-testid={alertType() === 'error' ? 'case-studies-error' : 'case-studies-success'}
          class={`rounded-lg border px-4 py-3 text-sm ${
            alertType() === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          {alertMsg()}
        </div>
      </Show>

      <Card>
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <div class="min-w-[220px] flex-1">
            <TextField
              value={query()}
              onInput={setQuery}
              placeholder="Buscar por código o nombre…"
              leadingIcon={<Search size={14} />}
            />
          </div>
          <Button type="button" size="sm" variant="outline" disabled={loading()} onClick={() => void load()}>
            Actualizar
          </Button>
        </div>

        <Show
          when={!loading()}
          fallback={<p class="py-8 text-center text-sm text-text-muted">Cargando casos de estudio…</p>}
        >
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="border-b border-border text-left text-text-muted dark:border-dark-border">
                  <th class="px-3 py-2">Código</th>
                  <th class="px-3 py-2">Nombre</th>
                  <th class="px-3 py-2">Estado</th>
                  <th class="px-3 py-2">Puntos</th>
                  <th class="px-3 py-2">Escenario default</th>
                  <th class="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <For each={filtered()}>
                  {(item) => (
                    <tr class="border-b border-border/60 hover:bg-slate-50 dark:border-dark-border/60 dark:hover:bg-dark-surface-hover">
                      <td class="px-3 py-2 font-mono text-xs">{item.code}</td>
                      <td class="px-3 py-2">
                        <A href={`/case-studies/${item.id}`} class="font-medium hover:text-fero-green-dark">
                          {item.name}
                        </A>
                        <Show when={item.description}>
                          <p class="mt-0.5 line-clamp-1 text-xs text-text-muted">{item.description}</p>
                        </Show>
                      </td>
                      <td class="px-3 py-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge variant={statusBadgeVariant(item.status)}>{STATUS_LABELS[item.status]}</Badge>
                          <Show when={!isCaseStudyDemoVisible(item)}>
                            <Badge variant="warning" title="Solo evidencia escrita — oculto en demo en vivo">
                              Evidencia
                            </Badge>
                          </Show>
                        </div>
                      </td>
                      <td class="px-3 py-2">
                        {item.activePointCount}/{item.pointCount}
                      </td>
                      <td class="px-3 py-2">{item.defaultScenarioId}</td>
                      <td class="px-3 py-2">
                        <div class="flex justify-end gap-1">
                          <A href={`/case-studies/${item.id}`}>
                            <Button type="button" size="sm" variant="outline">
                              Editar
                            </Button>
                          </A>
                          <A href={simulationCaseStudyHref(item.id)}>
                            <Button type="button" size="sm" variant="ghost" icon={<Play size={14} />} title="Simular" />
                          </A>
                          <Show when={canManage()}>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              icon={<Copy size={14} />}
                              title="Duplicar"
                              disabled={submitting()}
                              onClick={() => void handleDuplicate(item)}
                            />
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!filtered().length}>
              <p class="py-8 text-center text-sm text-text-muted">
                No hay casos de estudio. Crea el primero para comparar escenarios sin tocar SQL.
              </p>
            </Show>
          </div>
        </Show>
      </Card>

      <CaseStudyCreateModal
        open={modalOpen()}
        submitting={submitting()}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
