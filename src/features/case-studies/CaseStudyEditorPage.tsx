import { ArrowLeft, Play, Plus, Save, Search } from 'lucide-solid';
import { A, useNavigate, useParams } from '@solidjs/router';
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from 'solid-js';
import {
  fetchCaseStudyDetail,
  fetchCaseStudyGeoJson,
  patchCaseStudyPoint,
  replaceCaseStudyPoints,
  updateCaseStudy,
  type CaseStudyDetail,
  type CaseStudyPointInput,
  type CaseStudyPointRow,
} from '../../core/api/caseStudies';
import { fetchCollectionPointsForPlanning, type PlanningCollectionPointRef } from '../../core/api/collectionPoints';
import { fetchScenarios } from '../../core/api/simulation';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { simulationCaseStudyHref } from '../../core/utils/simulationLinks';
import { VALID_CASE_STUDY_STATUSES, type CaseStudyStatus, type ScenarioId } from '../../data/types/caseStudy';
import { Badge, Button, Card, Drawer, LoadingPanel, SelectField, TextField } from '../../design-system/components';
import { CaseStudyMapPanel } from './CaseStudyMapPanel';

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

function demandSourceLabel(source: CaseStudyPointRow['demandSource']): string {
  if (source === 'demand_override') return 'Demanda';
  if (source === 'fill_override') return 'Llenado';
  return 'Catálogo';
}

export default function CaseStudyEditorPage() {
  const params = useParams();
  const navigate = useNavigate();
  const caseStudyId = () => Number(params.id);

  const [detail, setDetail] = createSignal<CaseStudyDetail | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [alertMsg, setAlertMsg] = createSignal('');
  const [alertType, setAlertType] = createSignal<'error' | 'success'>('error');

  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [defaultScenarioId, setDefaultScenarioId] = createSignal<ScenarioId>('normal');
  const [status, setStatus] = createSignal<CaseStudyStatus>('draft');
  const [draftPoints, setDraftPoints] = createSignal<CaseStudyPointInput[]>([]);
  const [pointsDirty, setPointsDirty] = createSignal(false);

  const [selectedPointId, setSelectedPointId] = createSignal<number | null>(null);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSearch, setPickerSearch] = createSignal('');
  const [pickerSector, setPickerSector] = createSignal('');
  const [pickerSelection, setPickerSelection] = createSignal<number[]>([]);

  const [overrideFillPct, setOverrideFillPct] = createSignal('');
  const [overrideDemandKg, setOverrideDemandKg] = createSignal('');
  const [overrideActive, setOverrideActive] = createSignal(true);
  const [overrideNotes, setOverrideNotes] = createSignal('');

  const canManage = () => canOptimize(authUser()?.role);

  const [catalog] = createResource(fetchCollectionPointsForPlanning);
  const [scenarios] = createResource(fetchScenarios);
  const [geojson, { refetch: refetchGeojson }] = createResource(caseStudyId, fetchCaseStudyGeoJson);

  const sectorOptions = createMemo(() => {
    const names = new Set<string>();
    for (const point of catalog() ?? []) {
      if (point.sectorName) names.add(point.sectorName);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  });

  const pointRows = createMemo(() => detail()?.points ?? []);

  const selectedPoint = createMemo(() =>
    pointRows().find((row) => row.collectionPointId === selectedPointId()) ?? null,
  );

  const filteredPickerCatalog = createMemo(() => {
    const query = pickerSearch().trim().toLowerCase();
    const sector = pickerSector();
    return (catalog() ?? []).filter((point) => {
      if (sector && point.sectorName !== sector) return false;
      if (!query) return true;
      return (
        point.code.toLowerCase().includes(query) ||
        (point.sectorName ?? '').toLowerCase().includes(query)
      );
    });
  });

  const showAlert = (type: 'error' | 'success', message: string) => {
    setAlertType(type);
    setAlertMsg(message);
    setTimeout(() => setAlertMsg(''), 5000);
  };

  const syncFormFromDetail = (value: CaseStudyDetail) => {
    setName(value.name);
    setDescription(value.description ?? '');
    setDefaultScenarioId(value.defaultScenarioId);
    setStatus(value.status);
    setDraftPoints(
      value.points.map((point) => ({
        collectionPointId: point.collectionPointId,
        activeInStudy: point.activeInStudy,
        fillLevelKgOverride: point.fillLevelKgOverride,
        demandKgOverride: point.demandKgOverride,
        notes: point.notes,
        sortOrder: point.sortOrder,
      })),
    );
    setPointsDirty(false);
  };

  const loadDetail = async () => {
    const id = caseStudyId();
    if (!Number.isFinite(id) || id <= 0) {
      navigate('/case-studies', { replace: true });
      return;
    }
    setLoading(true);
    try {
      const value = await fetchCaseStudyDetail(id);
      setDetail(value);
      syncFormFromDetail(value);
      await refetchGeojson();
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudo cargar el caso');
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void loadDetail());

  createEffect(() => {
    const point = selectedPoint();
    if (!point) {
      setOverrideFillPct('');
      setOverrideDemandKg('');
      setOverrideActive(true);
      setOverrideNotes('');
      return;
    }
    const cap = point.resolvedFillLevelKg > 0 && point.catalogFillLevelPct > 0
      ? point.resolvedFillLevelKg / (point.catalogFillLevelPct / 100)
      : 1200;
    const fillPct =
      point.fillLevelKgOverride != null
        ? Math.round((point.fillLevelKgOverride / cap) * 100)
        : point.catalogFillLevelPct;
    setOverrideFillPct(String(fillPct));
    setOverrideDemandKg(point.demandKgOverride != null ? String(point.demandKgOverride) : '');
    setOverrideActive(point.activeInStudy);
    setOverrideNotes(point.notes ?? '');
  });

  const openPicker = () => {
    setPickerSelection(draftPoints().map((point) => point.collectionPointId));
    setPickerSearch('');
    setPickerSector('');
    setPickerOpen(true);
  };

  const togglePickerPoint = (pointId: number) => {
    setPickerSelection((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId],
    );
  };

  const addSectorToPicker = (sectorName: string) => {
    const ids = (catalog() ?? [])
      .filter((point) => point.sectorName === sectorName)
      .map((point) => point.id);
    setPickerSelection((current) => [...new Set([...current, ...ids])]);
  };

  const applyPickerSelection = async () => {
    const existing = new Map(draftPoints().map((point) => [point.collectionPointId, point]));
    const next: CaseStudyPointInput[] = pickerSelection().map((id, index) => {
      const prev = existing.get(id);
      return (
        prev ?? {
          collectionPointId: id,
          activeInStudy: true,
          sortOrder: index + 1,
        }
      );
    });
    setDraftPoints(next);
    setPointsDirty(true);
    setPickerOpen(false);
    await savePoints(next);
  };

  const saveMetadata = async () => {
    const id = caseStudyId();
    if (!detail()) return;
    setSaving(true);
    try {
      const updated = await updateCaseStudy(id, {
        name: name().trim(),
        description: description().trim() || null,
        defaultScenarioId: defaultScenarioId(),
        status: status(),
      });
      setDetail(updated);
      syncFormFromDetail(updated);
      showAlert('success', 'Metadatos guardados');
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const savePoints = async (points = draftPoints()) => {
    const id = caseStudyId();
    setSaving(true);
    try {
      const updated = await replaceCaseStudyPoints(id, points);
      setDetail(updated);
      syncFormFromDetail(updated);
      await refetchGeojson();
      showAlert('success', 'Puntos del caso actualizados');
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudieron guardar los puntos');
    } finally {
      setSaving(false);
    }
  };

  const savePointOverride = async () => {
    const id = caseStudyId();
    const pointId = selectedPointId();
    if (!pointId) return;

    const fillPct = overrideFillPct().trim();
    const demand = overrideDemandKg().trim();
    const catalogRef = catalog()?.find((row) => row.id === pointId);
    const catalogPoint = pointRows().find((row) => row.collectionPointId === pointId);
    const cap =
      catalogPoint && catalogPoint.catalogFillLevelPct > 0
        ? catalogPoint.resolvedFillLevelKg / (catalogPoint.catalogFillLevelPct / 100)
        : 1200;

    setSaving(true);
    try {
      await patchCaseStudyPoint(id, pointId, {
        activeInStudy: overrideActive(),
        fillLevelKgOverride: fillPct ? (Number(fillPct) / 100) * cap : null,
        demandKgOverride: demand ? Number(demand) : null,
        notes: overrideNotes().trim() || null,
      });
      await loadDetail();
      showAlert('success', `Overrides guardados para ${catalogRef?.code ?? pointId}`);
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'No se pudo guardar el punto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-2">
          <A
            href="/case-studies"
            class="inline-flex items-center gap-1 text-sm text-text-muted hover:text-fero-green-dark"
          >
            <ArrowLeft size={14} />
            Casos de estudio
          </A>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
              {detail()?.code ?? 'Caso de estudio'}
            </h1>
            <Show when={detail()}>
              {(row) => (
                <Badge variant={statusBadgeVariant(row().status)}>{STATUS_LABELS[row().status]}</Badge>
              )}
            </Show>
          </div>
          <p class="text-sm text-text-muted">
            Condiciones locales por punto — no modifican el catálogo global de contenedores.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Show when={detail()}>
            {(row) => (
              <A href={simulationCaseStudyHref(row().id)}>
                <Button type="button" size="sm" variant="primary" icon={<Play size={14} />}>
                  Simular este caso
                </Button>
              </A>
            )}
          </Show>
          <Show when={canManage()}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={<Save size={14} />}
              disabled={saving()}
              onClick={() => void saveMetadata()}
            >
              Guardar metadatos
            </Button>
          </Show>
        </div>
      </div>

      <Show when={alertMsg()}>
        <div
          class={`rounded-lg border px-4 py-3 text-sm ${
            alertType() === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          {alertMsg()}
        </div>
      </Show>

      <Show when={loading()} fallback={
        <>
          <Card>
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TextField label="Nombre" value={name()} onInput={setName} disabled={!canManage()} />
              <SelectField
                label="Escenario default"
                value={defaultScenarioId()}
                onChange={(event) => setDefaultScenarioId(event.currentTarget.value as ScenarioId)}
                disabled={!canManage()}
              >
                <For each={scenarios() ?? []}>
                  {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
                </For>
              </SelectField>
              <SelectField
                label="Estado"
                value={status()}
                onChange={(event) => setStatus(event.currentTarget.value as CaseStudyStatus)}
                disabled={!canManage()}
              >
                <For each={VALID_CASE_STUDY_STATUSES}>
                  {(value) => <option value={value}>{STATUS_LABELS[value]}</option>}
                </For>
              </SelectField>
              <TextField
                label="Descripción"
                value={description()}
                onInput={setDescription}
                disabled={!canManage()}
              />
            </div>
          </Card>

          <div class="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 class="text-lg font-semibold text-text-primary dark:text-white">Mapa del caso</h2>
                  <p class="text-xs text-text-muted">Clic en un pin para editar overrides del punto.</p>
                </div>
                <Show when={canManage()}>
                  <Button type="button" size="sm" variant="outline" icon={<Plus size={14} />} onClick={openPicker}>
                    Agregar puntos
                  </Button>
                </Show>
              </div>
              <CaseStudyMapPanel
                geojson={geojson()}
                selectedPointId={selectedPointId()}
                onSelectPoint={setSelectedPointId}
                heightClass="h-[360px]"
              />
            </Card>

            <Card>
              <h2 class="text-lg font-semibold text-text-primary dark:text-white">Overrides del punto</h2>
              <Show
                when={selectedPoint()}
                fallback={
                  <p class="mt-3 text-sm text-text-muted">
                    Selecciona un punto en el mapa o en la tabla para ajustar llenado, demanda o activo en el caso.
                  </p>
                }
              >
                {(point) => (
                  <div class="mt-4 space-y-3">
                    <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-dark-surface-hover">
                      <p class="font-medium text-text-primary dark:text-white">{point().code}</p>
                      <p class="text-text-muted">{point().sectorName ?? 'Sin sector'}</p>
                      <p class="mt-1 text-xs text-text-muted">
                        Catálogo: {point().catalogFillLevelPct}% · Resuelto: {point().resolvedDemandKg} kg (
                        {demandSourceLabel(point().demandSource)})
                      </p>
                    </div>
                    <TextField
                      label="Llenado % (override)"
                      type="number"
                      min={0}
                      max={100}
                      value={overrideFillPct()}
                      onInput={setOverrideFillPct}
                      disabled={!canManage()}
                    />
                    <TextField
                      label="Demanda kg (override)"
                      type="number"
                      min={0}
                      value={overrideDemandKg()}
                      onInput={setOverrideDemandKg}
                      disabled={!canManage()}
                    />
                    <label class="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={overrideActive()}
                        disabled={!canManage()}
                        onChange={(event) => setOverrideActive(event.currentTarget.checked)}
                      />
                      Activo en este caso
                    </label>
                    <TextField
                      label="Notas"
                      value={overrideNotes()}
                      onInput={setOverrideNotes}
                      disabled={!canManage()}
                    />
                    <Show when={canManage()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        icon={<Save size={14} />}
                        disabled={saving()}
                        onClick={() => void savePointOverride()}
                      >
                        Guardar overrides
                      </Button>
                    </Show>
                  </div>
                )}
              </Show>
            </Card>
          </div>

          <Card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-lg font-semibold text-text-primary dark:text-white">Puntos del caso</h2>
                <p class="text-xs text-text-muted">
                  {detail()?.activePointCount ?? 0} activos · {detail()?.pointCount ?? 0} total
                  <Show when={pointsDirty()}> · cambios pendientes</Show>
                </p>
              </div>
              <Show when={canManage() && pointsDirty()}>
                <Button type="button" size="sm" variant="primary" disabled={saving()} onClick={() => void savePoints()}>
                  Guardar puntos
                </Button>
              </Show>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="border-b border-border text-left text-text-muted dark:border-dark-border">
                    <th class="px-3 py-2">Código</th>
                    <th class="px-3 py-2">Sector</th>
                    <th class="px-3 py-2">Catálogo %</th>
                    <th class="px-3 py-2">Demanda kg</th>
                    <th class="px-3 py-2">Fuente</th>
                    <th class="px-3 py-2">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={pointRows()}>
                    {(point) => (
                      <tr
                        class={`cursor-pointer border-b border-border/60 hover:bg-slate-50 dark:border-dark-border/60 dark:hover:bg-dark-surface-hover ${
                          selectedPointId() === point.collectionPointId ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''
                        }`}
                        onClick={() => setSelectedPointId(point.collectionPointId)}
                      >
                        <td class="px-3 py-2 font-medium">{point.code}</td>
                        <td class="px-3 py-2">{point.sectorName ?? '—'}</td>
                        <td class="px-3 py-2">{point.catalogFillLevelPct}%</td>
                        <td class="px-3 py-2">{point.resolvedDemandKg}</td>
                        <td class="px-3 py-2">{demandSourceLabel(point.demandSource)}</td>
                        <td class="px-3 py-2">{point.activeInStudy ? 'Sí' : 'No'}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={!pointRows().length}>
                <p class="px-3 py-6 text-sm text-text-muted">Aún no hay puntos asignados a este caso.</p>
              </Show>
            </div>
          </Card>
        </>
      }>
        <LoadingPanel label="Cargando caso de estudio…" indeterminate />
      </Show>

      <Drawer open={pickerOpen()} onClose={() => setPickerOpen(false)} title="Seleccionar puntos">
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Buscar"
              value={pickerSearch()}
              onInput={setPickerSearch}
              leadingIcon={<Search size={14} />}
              placeholder="Código o sector"
            />
            <SelectField
              label="Sector"
              value={pickerSector()}
              onChange={(event) => setPickerSector(event.currentTarget.value)}
            >
              <option value="">Todos los sectores</option>
              <For each={sectorOptions()}>
                {(sector) => <option value={sector}>{sector}</option>}
              </For>
            </SelectField>
          </div>
          <Show when={pickerSector()}>
            <Button type="button" size="sm" variant="outline" onClick={() => addSectorToPicker(pickerSector())}>
              Agregar todos los puntos del sector «{pickerSector()}»
            </Button>
          </Show>
          <p class="text-xs text-text-muted">{pickerSelection().length} punto(s) seleccionados</p>
          <div class="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border p-2 dark:border-dark-border">
            <For each={filteredPickerCatalog()}>
              {(point: PlanningCollectionPointRef) => (
                <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-dark-surface-hover">
                  <input
                    type="checkbox"
                    checked={pickerSelection().includes(point.id)}
                    onChange={() => togglePickerPoint(point.id)}
                  />
                  <span class="min-w-0 flex-1">
                    <span class="font-medium">{point.code}</span>
                    <span class="ml-2 text-xs text-text-muted">{point.sectorName ?? 'Sin sector'}</span>
                  </span>
                </label>
              )}
            </For>
          </div>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={saving()} onClick={() => void applyPickerSelection()}>
              Aplicar selección
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
