import { For, Show, createSignal, onMount } from 'solid-js';
import { Button, Card, CardHeader, TextField } from '../../design-system/components';
import {
  fetchAlgorithmSettings,
  updateAlgorithmSettings,
  type AlgorithmSettings,
} from '../../core/api/admin';

interface FieldSpec {
  key: keyof AlgorithmSettings;
  label: string;
  hint: string;
  step: string;
  min: string;
  max?: string;
}

const ACO_FIELDS: FieldSpec[] = [
  {
    key: 'acoAlpha',
    label: 'Alpha (feromona)',
    hint: 'Peso de la feromona en la elección (α). Más alto = más explotación.',
    step: '0.1',
    min: '0.1',
    max: '20',
  },
  {
    key: 'acoBeta',
    label: 'Beta (distancia)',
    hint: 'Peso de la cercanía/distancia en la elección (β). Más alto = más greedy.',
    step: '0.1',
    min: '0',
    max: '20',
  },
  {
    key: 'acoRho',
    label: 'Rho (evaporación)',
    hint: 'Tasa de evaporación de la feromona por iteración (0–1).',
    step: '0.01',
    min: '0.01',
    max: '1',
  },
  {
    key: 'pheromoneQ',
    label: 'Q (depósito de feromona)',
    hint: 'Escala del refuerzo depositado: Δτ = Q / costo. Más alto refuerza más.',
    step: '1',
    min: '0.01',
  },
  {
    key: 'acoAnts',
    label: 'Hormigas ACO',
    hint: 'Tamaño de la colonia por iteración (1–200).',
    step: '1',
    min: '1',
    max: '200',
  },
  {
    key: 'acoIterations',
    label: 'Iteraciones ACO',
    hint: 'Máximo de iteraciones de la metaheurística (1–500).',
    step: '1',
    min: '1',
    max: '500',
  },
  {
    key: 'acoPatience',
    label: 'Paciencia (convergencia)',
    hint: 'Iteraciones sin mejora antes de detener el ACO (0 = sin corte).',
    step: '1',
    min: '0',
    max: '100',
  },
  {
    key: 'twoOptPasses',
    label: 'Pasadas de 2-opt',
    hint: 'Mejora local por ruta construida (1–100).',
    step: '1',
    min: '1',
    max: '100',
  },
];

function FieldGrid(props: {
  fields: FieldSpec[];
  settings: AlgorithmSettings;
  saving: boolean;
  onPatch: (key: keyof AlgorithmSettings, value: number) => void;
}) {
  return (
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <For each={props.fields}>
        {(field) => (
          <div class="space-y-1">
            <TextField
              label={field.label}
              type="number"
              step={field.step}
              min={field.min}
              max={field.max}
              value={String(props.settings[field.key] ?? '')}
              disabled={props.saving}
              onInput={(e) => props.onPatch(field.key, Number(e.currentTarget.value))}
            />
            <p class="text-xs text-text-muted">{field.hint}</p>
          </div>
        )}
      </For>
    </div>
  );
}

/** Hiperparámetros del motor ACO (planner/admin): la pestaña los calibra, aquí se aplican. */
export function AlgorithmSettingsPanel(props: { onFlash?: (message: string) => void }) {
  const [settings, setSettings] = createSignal<AlgorithmSettings | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [flash, setFlash] = createSignal('');

  onMount(() => {
    void fetchAlgorithmSettings()
      .then(setSettings)
      .catch(() => setError('No se pudieron cargar los parámetros del algoritmo'));
  });

  const patch = (key: keyof AlgorithmSettings, value: number) =>
    setSettings((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    const current = settings();
    if (!current) return;
    setError('');
    setFlash('');
    setSaving(true);
    try {
      const updated = await updateAlgorithmSettings(current);
      setSettings(updated);
      setFlash('Parámetros del ACO actualizados');
      props.onFlash?.('Parámetros del ACO actualizados');
    } catch {
      setError('No se pudieron guardar los parámetros del ACO');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card class="space-y-4 p-4">
      <CardHeader
        title="Motor ACO"
        subtitle="Hiperparámetros de la colonia; aplican a las próximas optimizaciones. Se calibran en la pestaña Calibración."
      />

      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>

      <Show when={flash()}>
        <p class="text-sm text-fero-green-dark">{flash()}</p>
      </Show>

      <Show
        when={settings()}
        fallback={<p class="text-sm text-text-muted">Cargando parámetros…</p>}
      >
        {(current) => (
          <>
            <FieldGrid fields={ACO_FIELDS} settings={current()} saving={saving()} onPatch={patch} />

            <label class="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={current().pheromoneElitist}
                disabled={saving()}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, pheromoneElitist: e.currentTarget.checked } : prev,
                  )
                }
              />
              Refuerzo elitista: deposita feromona también sobre la mejor solución global.
            </label>

            <div class="flex justify-end">
              <Button variant="primary" loading={saving()} onClick={() => void save()}>
                Guardar parámetros
              </Button>
            </div>
          </>
        )}
      </Show>
    </Card>
  );
}
