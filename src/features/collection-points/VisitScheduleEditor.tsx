import { createSignal, For, Show } from 'solid-js';
import { Button, TextField } from '../../design-system/components';
import {
  fetchVisitSchedule,
  upsertVisitSchedule,
  type VisitSchedule,
} from '../../core/api/visitSchedules';

const weekdayOptions = [
  { value: 0, label: 'Lun' },
  { value: 1, label: 'Mar' },
  { value: 2, label: 'Mié' },
  { value: 3, label: 'Jue' },
  { value: 4, label: 'Vie' },
  { value: 5, label: 'Sáb' },
  { value: 6, label: 'Dom' },
];

interface VisitScheduleEditorProps {
  pointCode: string;
}

export function VisitScheduleEditor(props: VisitScheduleEditorProps) {
  const [schedule, setSchedule] = createSignal<VisitSchedule | null>(null);
  const [visitsPerWeek, setVisitsPerWeek] = createSignal('1');
  const [selectedDays, setSelectedDays] = createSignal<number[]>([0]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchVisitSchedule(props.pointCode);
      setSchedule(row);
      if (row) {
        setVisitsPerWeek(String(row.visitsPerWeek));
        setSelectedDays(row.weekdays);
      }
    } catch {
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  };

  void load();

  const toggleDay = (day: number) => {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await upsertVisitSchedule(props.pointCode, {
        visitsPerWeek: Number(visitsPerWeek()),
        weekdays: selectedDays(),
      });
      setSchedule(saved);
      setNotice('Frecuencia guardada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la frecuencia');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-3 rounded-lg border border-border p-3 dark:border-dark-border">
      <p class="text-sm font-semibold text-text-primary dark:text-white">Frecuencia semanal</p>
      <Show when={!loading()} fallback={<p class="text-sm text-text-muted">Cargando frecuencia…</p>}>
        <TextField
          label="Visitas por semana"
          type="number"
          min={1}
          max={7}
          value={visitsPerWeek()}
          onInput={(e) => setVisitsPerWeek(e.currentTarget.value)}
        />
        <div>
          <p class="mb-2 text-sm font-medium text-text-secondary">Días de recolección</p>
          <div class="flex flex-wrap gap-2">
            <For each={weekdayOptions}>
              {(option) => (
                <button
                  type="button"
                  class={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    selectedDays().includes(option.value)
                      ? 'border-fero-green-mid bg-fero-green/15 text-fero-green-dark'
                      : 'border-border text-text-muted'
                  }`}
                  onClick={() => toggleDay(option.value)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={schedule()}>
          <p class="text-xs text-text-muted">
            Vigente desde {schedule()?.effectiveFrom}
            {schedule()?.effectiveUntil ? ` hasta ${schedule()?.effectiveUntil}` : ''}
          </p>
        </Show>
        <Button size="sm" loading={saving()} onClick={() => void save()}>
          Guardar frecuencia
        </Button>
        <Show when={error()}>
          <p class="text-sm text-red-500">{error()}</p>
        </Show>
        <Show when={notice()}>
          <p class="text-sm text-fero-green-dark">{notice()}</p>
        </Show>
      </Show>
    </div>
  );
}
