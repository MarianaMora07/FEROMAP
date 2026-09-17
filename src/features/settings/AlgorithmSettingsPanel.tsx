import { For, Show, createSignal, onMount } from 'solid-js';
import { Button, Card, CardHeader, TextField } from '../../design-system/components';
import {
  fetchAlgorithmSettings,
  updateAlgorithmSettings,
  type AlgorithmSettings,
} from '../../core/api/admin';
import { OBJECTIVE_WEIGHT_UI_MAX } from '../optimization/optimizationObjectiveUx';

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

/**
 * Uso de flota (Fase 13). Es el bloque que decide cuántos camiones trabajan y cómo se
 * reparte la carga: los pesos equilibran horas y ruta más larga, el mínimo de camiones
 * activos lo garantiza y la jornada de turno es el mando que reparte la demanda.
 */
const FLEET_FIELDS: FieldSpec[] = [
  {
    key: 'workloadBalanceWeight',
    label: 'Equidad de carga (λ_b)',
    hint: 'Peso del desbalance de horas entre camiones (σ/μ). 0 = solo distancia. Recomendado 0–3.',
    step: '0.5',
    min: '0',
    max: String(OBJECTIVE_WEIGHT_UI_MAX),
  },
  {
    key: 'makespanWeight',
    label: 'Makespan (λ_t)',
    hint: 'Peso de la ruta más larga (T_max / jornada). 0 = solo distancia.',
    step: '0.5',
    min: '0',
    max: String(OBJECTIVE_WEIGHT_UI_MAX),
  },
  {
    key: 'maxRouteHoursTarget',
    label: 'Jornada objetivo del KPI (h)',
    hint: 'Techo de referencia del KPI de cumplimiento de jornada (1–18). No recorta el turno.',
    step: '0.5',
    min: '1',
    max: '18',
  },
];

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

const HEURISTIC_FIELDS: FieldSpec[] = [
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
];

const GENERATION_FIELDS: FieldSpec[] = [
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

function SectionTitle(props: { children: string }) {
  return (
    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{props.children}</p>
  );
}

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

  const patchNullable = (key: 'minActiveVehicles' | 'defaultShiftHours', raw: string) => {
    const trimmed = raw.trim();
    setSettings((current) =>
      current
        ? { ...current, [key]: trimmed === '' ? null : Math.max(1, Number(trimmed)) }
        : current,
    );
  };

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
            {/* --- Uso de flota (Fase 13) --- */}
            <div class="space-y-3 rounded-md border border-default bg-surface/60 p-3 dark:border-dark-border">
              <SectionTitle>Uso de flota</SectionTitle>
              <FieldGrid
                fields={FLEET_FIELDS}
                settings={current()}
                saving={saving()}
                onPatch={patch}
              />

              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div class="space-y-1">
                  <TextField
                    label="Camiones activos (mínimo por día)"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Sin restricción"
                    value={
                      current().minActiveVehicles == null ? '' : String(current().minActiveVehicles)
                    }
                    disabled={saving()}
                    onInput={(e) => patchNullable('minActiveVehicles', e.currentTarget.value)}
                  />
                  <p class="text-xs text-text-muted">
                    Garantiza que trabajen al menos N camiones. Si es mayor que los puntos del día,
                    el motor lo degrada y avisa.
                  </p>
                </div>
                <div class="space-y-1">
                  <TextField
                    label="Jornada de turno por defecto (h)"
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    placeholder="Jornada de la instalación"
                    value={
                      current().defaultShiftHours == null ? '' : String(current().defaultShiftHours)
                    }
                    disabled={saving()}
                    onInput={(e) => patchNullable('defaultShiftHours', e.currentTarget.value)}
                  />
                  <p class="text-xs text-text-muted">
                    Recorta el turno de todas las optimizaciones (incluido el plan semanal). A igual
                    demanda, una jornada más corta necesita <b>más camiones</b>.
                  </p>
                </div>
              </div>

              <label class="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={current().weeklyFleetRotation}
                  disabled={saving()}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, weeklyFleetRotation: e.currentTarget.checked } : prev,
                    )
                  }
                />
                Rotación de flota semanal: reparte los días de trabajo entre los camiones al generar
                el plan operativo (Lun→Vie).
              </label>

              <p class="rounded-md border border-default bg-elevated/60 px-3 py-2 text-xs text-text-secondary">
                Cuántos camiones se usan depende sobre todo de la <b>jornada de turno</b> y de la
                demanda del día: con turnos largos, pocos camiones bastan aunque los pesos estén
                activos. Para repartir más, acorta la jornada de turno o fija un mínimo de camiones
                activos.
              </p>
            </div>

            {/* --- Motor ACO --- */}
            <SectionTitle>Motor ACO</SectionTitle>
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

            {/* --- Heurístico por llenado --- */}
            <SectionTitle>Heurístico por prioridad de llenado</SectionTitle>
            <FieldGrid
              fields={HEURISTIC_FIELDS}
              settings={current()}
              saving={saving()}
              onPatch={patch}
            />

            {/* --- Rebose y calibración --- */}
            <SectionTitle>Rebose y calibración</SectionTitle>
            <FieldGrid
              fields={GENERATION_FIELDS}
              settings={current()}
              saving={saving()}
              onPatch={patch}
            />

            <div class="space-y-3 rounded-md border border-border bg-surface/60 p-3 dark:border-dark-border">
              <SectionTitle>Ecuación del ACO</SectionTitle>
              <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-text-primary dark:text-white">
{`Selección (ruleta) — probabilidad del candidato c desde el nodo i:

              τ(i,c)^α · (1 / d(i,c))^β · b(c)
  P(c) =  ────────────────────────────────────────
          Σ_k  τ(i,k)^α · (1 / d(i,k))^β · b(k)

Feromona:
  τ(i,j) ← (1 − ρ) · τ(i,j) + Q / C

Objetivo (Fase 13):
  min  w_d · (D / D_ref) + w_b · (σ_horas / μ_horas) + w_t · (T_max / H_jornada)`}
              </pre>
              <p class="text-xs text-text-muted">
                τ = feromona · d = distancia · b = sesgo de prioridad · C = costo de la mejor solución
                de la iteración · Q = escala de depósito. En el objetivo, D = distancia de la flota,
                σ/μ = desbalance de horas entre camiones y T_max/H = ruta más larga sobre la jornada.
              </p>

              <SectionTitle>Valores actuales</SectionTitle>
              <div class="grid gap-x-6 gap-y-1 text-xs text-text-secondary sm:grid-cols-2 lg:grid-cols-3">
                <span>
                  λ_b (equidad) = <b>{fmt(current().workloadBalanceWeight)}</b>
                </span>
                <span>
                  λ_t (makespan) = <b>{fmt(current().makespanWeight)}</b>
                </span>
                <span>
                  camiones activos (mín.) = <b>{current().minActiveVehicles ?? '—'}</b>
                </span>
                <span>
                  jornada de turno = <b>{current().defaultShiftHours ?? 'instalación'}</b>
                  {current().defaultShiftHours == null ? '' : ' h'}
                </span>
                <span>
                  jornada objetivo (KPI) = <b>{fmt(current().maxRouteHoursTarget, 1)}</b> h
                </span>
                <span>
                  rotación semanal = <b>{current().weeklyFleetRotation ? 'sí' : 'no'}</b>
                </span>
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
