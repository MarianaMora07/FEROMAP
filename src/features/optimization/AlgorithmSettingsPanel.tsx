import { Show, createSignal, onMount } from 'solid-js';
import { Button, Card, CardHeader, TextField } from '../../design-system/components';
import {
  fetchAlgorithmSettings,
  updateAlgorithmSettings,
  type AlgorithmSettings,
} from '../../core/api/admin';

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

interface FieldSpec {
  key: keyof AlgorithmSettings;
  label: string;
  hint: string;
  step: string;
  min: string;
  max?: string;
}

const FIELDS: FieldSpec[] = [
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
  {
    key: 'heuristicAtRiskMultiplier',
    label: 'Peso en riesgo (calendario)',
    hint: 'Multiplica la atracción de contenedores en riesgo de rebose (> 1).',
    step: '0.05',
    min: '0.1',
    max: '10',
  },
  {
    key: 'heuristicCriticalMultiplier',
    label: 'Peso crítico (≥ 80 %)',
    hint: 'Multiplica la atracción de contenedores críticos (> 1).',
    step: '0.05',
    min: '0.1',
    max: '10',
  },
  {
    key: 'heuristicHighMultiplier',
    label: 'Peso lleno (≥ 60 %)',
    hint: 'Multiplica la atracción de contenedores llenos (> 1).',
    step: '0.05',
    min: '0.1',
    max: '10',
  },
  {
    key: 'matrixCriticalFactor',
    label: 'Factor matriz crítico',
    hint: 'Reduce el costo hacia críticos en la matriz heurística (< 1).',
    step: '0.05',
    min: '0.01',
    max: '1',
  },
  {
    key: 'matrixHighFactor',
    label: 'Factor matriz lleno',
    hint: 'Reduce el costo hacia llenos en la matriz heurística (< 1).',
    step: '0.05',
    min: '0.01',
    max: '1',
  },
  {
    key: 'overflowPenaltyWeight',
    label: 'Penalización por rebose (m/kg)',
    hint: 'Costo por kg rebosado en la función objetivo. 0 = desactivada.',
    step: '10',
    min: '0',
  },
  {
    key: 'calibrationDefaultAlpha',
    label: 'Alpha de calibración (EWMA)',
    hint: 'Peso del dato reciente al calibrar con pesos reales (0–1).',
    step: '0.05',
    min: '0.05',
    max: '1',
  },
  {
    key: 'calibrationWindowDays',
    label: 'Ventana de calibración (días)',
    hint: 'Historial de recolecciones considerado al calibrar (1–365).',
    step: '1',
    min: '1',
    max: '365',
  },
];

/** Configura los parámetros del motor de optimización (planner/admin). */
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
      setFlash('Parámetros del algoritmo actualizados');
      props.onFlash?.('Parámetros del algoritmo actualizados');
    } catch {
      setError('No se pudieron guardar los parámetros del algoritmo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card class="space-y-4 p-4">
      <CardHeader
        title="Parámetros del algoritmo"
        subtitle="Ajustes del motor ACO y del modelo de generación. Aplican a las próximas optimizaciones."
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
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((field) => (
                <div class="space-y-1">
                  <TextField
                    label={field.label}
                    type="number"
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={String(current()[field.key])}
                    disabled={saving()}
                    onInput={(e) => patch(field.key, Number(e.currentTarget.value))}
                  />
                  <p class="text-xs text-text-muted">{field.hint}</p>
                </div>
              ))}
            </div>

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

            <div class="space-y-3 rounded-md border border-border bg-surface/60 p-3 dark:border-dark-border">
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Ecuación del ACO
              </p>
              <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-text-primary dark:text-white">
{`Selección (ruleta) — probabilidad del candidato c desde el nodo i:

              τ(i,c)^α · (1 / d(i,c))^β · b(c)
  P(c) =  ────────────────────────────────────────
          Σ_k  τ(i,k)^α · (1 / d(i,k))^β · b(k)

Feromona:
  τ(i,j) ← (1 − ρ) · τ(i,j) + Q / C`}
              </pre>
              <p class="text-xs text-text-muted">
                τ = feromona · d = distancia · b = sesgo de prioridad · C = costo de la mejor solución
                de la iteración · Q = escala de depósito.
              </p>

              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Valores actuales
              </p>
              <div class="grid gap-x-6 gap-y-1 text-xs text-text-secondary sm:grid-cols-2 lg:grid-cols-3">
                <span>
                  α (feromona) = <b>{fmt(current().acoAlpha)}</b>
                </span>
                <span>
                  β (distancia) = <b>{fmt(current().acoBeta)}</b>
                </span>
                <span>
                  ρ (evaporación) = <b>{fmt(current().acoRho)}</b>
                </span>
                <span>
                  Q (depósito) = <b>{fmt(current().pheromoneQ)}</b>
                </span>
                <span>
                  elitista = <b>{current().pheromoneElitist ? 'sí' : 'no'}</b>
                </span>
                <span>
                  C = costo de la mejor ruta de la iteración
                </span>
                <span>
                  b(riesgo) = <b>{fmt(current().heuristicAtRiskMultiplier)}</b>
                </span>
                <span>
                  b(crítico ≥ 80 %) = <b>{fmt(current().heuristicCriticalMultiplier)}</b>
                </span>
                <span>
                  b(lleno ≥ 60 %) = <b>{fmt(current().heuristicHighMultiplier)}</b>
                </span>
                <span>
                  d(crítico) × = <b>{fmt(current().matrixCriticalFactor)}</b>
                </span>
                <span>
                  d(lleno) × = <b>{fmt(current().matrixHighFactor)}</b>
                </span>
                <span>
                  b(resto) = <b>1,00</b>
                </span>
                <span>
                  hormigas = <b>{current().acoAnts}</b>
                </span>
                <span>
                  iteraciones = <b>{current().acoIterations}</b>
                </span>
                <span>
                  paciencia = <b>{current().acoPatience}</b>
                </span>
                <span>
                  2-opt (hormiga) = <b>{current().twoOptPasses}</b> pasadas
                </span>
                <span>
                  penalización rebose = <b>{fmt(current().overflowPenaltyWeight, 1)}</b> m/kg
                </span>
                <span>
                  calibración α / ventana = <b>{fmt(current().calibrationDefaultAlpha)}</b> /{' '}
                  <b>{current().calibrationWindowDays}</b> d
                </span>
              </div>
            </div>

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
