import { For, Show, createSignal, onMount } from 'solid-js';
import { Button, Card, SelectField, TextField } from '../../design-system/components';
import {
  fetchAdminSettings,
  updateAdminSettings,
  type OperationalSettings,
} from '../../core/api/admin';
import {
  dateFormatOptions,
  fillThresholdOptions,
  idleOptions,
  languageOptions,
  refreshOptions,
  sessionTimeoutOptions,
  timezoneOptions,
  distanceUnitOptions,
  volumeUnitOptions,
  weightUnitOptions,
  timeUnitOptions,
} from '../../data/mock/admin';

function ToggleSwitch(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <div class="flex items-start justify-between gap-4 rounded-md border border-border bg-slate-50/80 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-hover/40">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text-primary dark:text-white">{props.label}</p>
        <Show when={props.description}>
          <p class="mt-0.5 text-xs text-text-muted">{props.description}</p>
        </Show>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={props.onChange}
        class={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-fero-blue' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          class={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            props.checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function AdminOperationalSettings(props: { onFlash: (message: string) => void }) {
  const [settings, setSettings] = createSignal<OperationalSettings | null>(null);
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    void fetchAdminSettings().then(setSettings);
  });

  const patch = (partial: Partial<OperationalSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const save = () => {
    const current = settings();
    if (!current) return;
    setSaving(true);
    void updateAdminSettings(current)
      .then((saved) => {
        setSettings(saved);
        props.onFlash('Configuración operativa guardada.');
      })
      .catch(() => props.onFlash('No se pudo guardar la configuración.'))
      .finally(() => setSaving(false));
  };

  return (
    <Show
      when={settings()}
      fallback={<p class="text-sm text-text-muted">Cargando configuración...</p>}
    >
      {(s) => (
        <div class="space-y-4">
          <Card class="space-y-4 p-4">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              Información general
            </h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nombre del sistema"
                class="sm:col-span-2"
                value={s().systemName}
                onInput={(e) => patch({ systemName: e.currentTarget.value })}
              />
              <SelectField
                label="Idioma"
                value={s().language}
                onChange={(e) => patch({ language: e.currentTarget.value })}
              >
                <For each={languageOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Zona horaria"
                value={s().timezone}
                onChange={(e) => patch({ timezone: e.currentTarget.value })}
              >
                <For each={timezoneOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Formato de fecha"
                value={s().dateFormat}
                onChange={(e) => patch({ dateFormat: e.currentTarget.value })}
              >
                <For each={dateFormatOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </div>
          </Card>

          <Card class="space-y-4 p-4">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              Parámetros operativos
            </h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Actualización en tiempo real (s)"
                value={String(s().refreshSeconds)}
                onChange={(e) => patch({ refreshSeconds: Number(e.currentTarget.value) })}
              >
                <For each={refreshOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <TextField
                label="Capacidad máxima (t)"
                type="number"
                value={String(s().maxLoadTons)}
                onInput={(e) => patch({ maxLoadTons: Number(e.currentTarget.value) })}
              />
              <SelectField
                label="Inactividad de vehículo (min)"
                value={String(s().idleMinutes)}
                onChange={(e) => patch({ idleMinutes: Number(e.currentTarget.value) })}
              >
                <For each={idleOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <TextField
                label="Velocidad promedio (km/h)"
                type="number"
                value={String(s().defaultSpeedKmh)}
                onInput={(e) => patch({ defaultSpeedKmh: Number(e.currentTarget.value) })}
              />
              <TextField
                label="Distancia máx. asignación (km)"
                type="number"
                value={String(s().maxAssignDistanceKm)}
                onInput={(e) => patch({ maxAssignDistanceKm: Number(e.currentTarget.value) })}
              />
              <SelectField
                label="Tiempo de sesión (min)"
                value={String(s().sessionTimeoutMinutes)}
                onChange={(e) => patch({ sessionTimeoutMinutes: Number(e.currentTarget.value) })}
              >
                <For each={sessionTimeoutOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </div>
            <ToggleSwitch
              label="Recalcular rutas automáticamente"
              description="Ante cambios de demanda, tráfico o estado de flota."
              checked={s().autoRecalcRoutes}
              onChange={() => patch({ autoRecalcRoutes: !s().autoRecalcRoutes })}
            />
          </Card>

          <Card class="space-y-4 p-4">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              Unidades y umbrales
            </h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Unidad de distancia"
                value={s().distanceUnit}
                onChange={(e) => patch({ distanceUnit: e.currentTarget.value })}
              >
                <For each={distanceUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Unidad de volumen"
                value={s().volumeUnit}
                onChange={(e) => patch({ volumeUnit: e.currentTarget.value })}
              >
                <For each={volumeUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Unidad de peso"
                value={s().weightUnit}
                onChange={(e) => patch({ weightUnit: e.currentTarget.value })}
              >
                <For each={weightUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Unidad de tiempo"
                value={s().timeUnit}
                onChange={(e) => patch({ timeUnit: e.currentTarget.value })}
              >
                <For each={timeUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Umbral de llenado (%)"
                value={String(s().fillThresholdPct)}
                onChange={(e) => patch({ fillThresholdPct: Number(e.currentTarget.value) })}
              >
                <For each={fillThresholdOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <TextField
                label="Inicio jornada"
                type="time"
                value={s().workStart}
                onInput={(e) => patch({ workStart: e.currentTarget.value })}
              />
              <TextField
                label="Fin jornada"
                type="time"
                value={s().workEnd}
                onInput={(e) => patch({ workEnd: e.currentTarget.value })}
              />
            </div>
          </Card>

          <div class="flex justify-end">
            <Button type="button" variant="primary" size="sm" loading={saving()} onClick={save}>
              Guardar configuración
            </Button>
          </div>
        </div>
      )}
    </Show>
  );
}
