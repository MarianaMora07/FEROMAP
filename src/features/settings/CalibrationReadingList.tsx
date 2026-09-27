import { For, Show } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import type { CalibrationReading } from './calibrationRunUx';

interface CalibrationReadingListProps {
  title: string;
  findings: CalibrationReading[];
}

/**
 * «Lectura automática» de un barrido: enunciado traducido + datos ya formateados.
 *
 * Los ejes implicados vienen como claves i18n (`axisKeys`) y se traducen aquí; el detalle
 * nunca contiene texto traducible, así que se pinta tal cual.
 */
export function CalibrationReadingList(props: CalibrationReadingListProps) {
  const tr = useLocale();

  return (
    <Card data-testid="calibration-reading">
      <CardHeader title={props.title} />
      <ul class="list-disc space-y-1 pl-5 text-sm text-text-secondary">
        <For each={props.findings}>
          {(finding) => (
            <li>
              <span class="font-medium text-text-primary">{tr(finding.labelKey)}: </span>
              <Show when={finding.axisKeys?.length ? finding.axisKeys : null}>
                {(keys) => <span class="mr-1">{keys().map((key) => tr(key)).join(', ')} · </span>}
              </Show>
              {finding.detail}
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
