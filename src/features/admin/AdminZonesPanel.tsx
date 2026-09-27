import { For, Show, createSignal, onMount } from 'solid-js';
import { Button, Card, TextField } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import { fetchZones, updateZone, type ZoneConfig } from '../../core/api/zones';

interface ZoneDraft {
  depotLat: string;
  depotLon: string;
  landfillLat: string;
  landfillLon: string;
  timeWindowStart: string;
  timeWindowEnd: string;
}

function toDraft(zone: ZoneConfig): ZoneDraft {
  const numberText = (value: number | null) => (value === null ? '' : String(value));
  return {
    depotLat: numberText(zone.depotLat),
    depotLon: numberText(zone.depotLon),
    landfillLat: numberText(zone.landfillLat),
    landfillLon: numberText(zone.landfillLon),
    timeWindowStart: zone.timeWindowStart ?? '',
    timeWindowEnd: zone.timeWindowEnd ?? '',
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ZoneRow(props: {
  zone: ZoneConfig;
  onSaved: (zone: ZoneConfig) => void;
  onFlash?: (message: string) => void;
}) {
  const tr = useLocale();
  const [draft, setDraft] = createSignal<ZoneDraft>(toDraft(props.zone));
  const [saving, setSaving] = createSignal(false);

  const patch = (partial: Partial<ZoneDraft>) =>
    setDraft((previous) => ({ ...previous, ...partial }));

  const save = () => {
    const current = draft();
    setSaving(true);
    void updateZone(props.zone.id, {
      depotLat: numberOrNull(current.depotLat),
      depotLon: numberOrNull(current.depotLon),
      landfillLat: numberOrNull(current.landfillLat),
      landfillLon: numberOrNull(current.landfillLon),
      timeWindowStart: textOrNull(current.timeWindowStart),
      timeWindowEnd: textOrNull(current.timeWindowEnd),
    })
      .then((saved) => {
        setDraft(toDraft(saved));
        props.onSaved(saved);
        props.onFlash?.(tr('zones.saved'));
      })
      .catch(() => props.onFlash?.(tr('zones.error')))
      .finally(() => setSaving(false));
  };

  return (
    <div class="space-y-3 rounded-md border border-border p-4 dark:border-dark-border">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-semibold text-text-primary dark:text-white">
          {props.zone.name}
          <span class="ml-2 text-xs font-normal text-text-muted">{props.zone.city}</span>
        </p>
        <Button size="sm" loading={saving()} onClick={save}>
          {tr('zones.save')}
        </Button>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          type="number"
          step="0.0001"
          label={`${tr('zones.depot')} lat`}
          value={draft().depotLat}
          onInput={(e) => patch({ depotLat: e.currentTarget.value })}
        />
        <TextField
          type="number"
          step="0.0001"
          label={`${tr('zones.depot')} lon`}
          value={draft().depotLon}
          onInput={(e) => patch({ depotLon: e.currentTarget.value })}
        />
        <TextField
          type="number"
          step="0.0001"
          label={`${tr('zones.landfill')} lat`}
          value={draft().landfillLat}
          onInput={(e) => patch({ landfillLat: e.currentTarget.value })}
        />
        <TextField
          type="number"
          step="0.0001"
          label={`${tr('zones.landfill')} lon`}
          value={draft().landfillLon}
          onInput={(e) => patch({ landfillLon: e.currentTarget.value })}
        />
        <TextField
          type="time"
          label={`${tr('zones.window')} ${tr('zones.start')}`}
          value={draft().timeWindowStart}
          onInput={(e) => patch({ timeWindowStart: e.currentTarget.value })}
        />
        <TextField
          type="time"
          label={`${tr('zones.window')} ${tr('zones.end')}`}
          value={draft().timeWindowEnd}
          onInput={(e) => patch({ timeWindowEnd: e.currentTarget.value })}
        />
      </div>
      <p class="text-xs text-text-muted">{tr('zones.inherit')}</p>
    </div>
  );
}

export function AdminZonesPanel(props: { onFlash?: (message: string) => void }) {
  const tr = useLocale();
  const [zones, setZones] = createSignal<ZoneConfig[] | null>(null);

  onMount(() => {
    void fetchZones()
      .then(setZones)
      .catch(() => setZones([]));
  });

  const replaceZone = (updated: ZoneConfig) =>
    setZones((previous) =>
      previous ? previous.map((zone) => (zone.id === updated.id ? updated : zone)) : previous,
    );

  return (
    <Card class="space-y-4 p-4">
      <div>
        <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
          {tr('zones.title')}
        </h3>
        <p class="mt-1 text-sm text-text-muted">{tr('zones.subtitle')}</p>
      </div>

      <Show when={zones()} fallback={<p class="text-sm text-text-muted">Cargando zonas...</p>}>
        {(list) => (
          <Show
            when={list().length > 0}
            fallback={<p class="text-sm text-text-muted">{tr('zones.empty')}</p>}
          >
            <div class="space-y-3">
              <For each={list()}>
                {(zone) => (
                  <ZoneRow zone={zone} onSaved={replaceZone} onFlash={props.onFlash} />
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>
    </Card>
  );
}
