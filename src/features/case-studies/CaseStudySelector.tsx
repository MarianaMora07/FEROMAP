import { For, Show, createResource, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { Layers } from 'lucide-solid';
import { fetchCaseStudies, fetchCaseStudyDetail, type CaseStudyDetail } from '../../core/api/caseStudies';
import { SelectField } from '../../design-system/components';

interface CaseStudySelectorProps {
  value: CaseStudyDetail | null;
  onChange: (detail: CaseStudyDetail | null) => void;
  disabled?: boolean;
  /** operational = plan semanal; thesis = simulación de tesis */
  context?: 'operational' | 'thesis';
}

export function CaseStudySelector(props: CaseStudySelectorProps) {
  const [loadingDetail, setLoadingDetail] = createSignal(false);
  const [cases] = createResource(() =>
    fetchCaseStudies({ limit: 100, demoOnly: true }).then((response) => response.items),
  );

  const selectedValue = () => (props.value ? String(props.value.id) : '');

  const handleChange = async (event: Event) => {
    const raw = (event.currentTarget as HTMLSelectElement).value;
    if (!raw) {
      props.onChange(null);
      return;
    }
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    setLoadingDetail(true);
    try {
      props.onChange(await fetchCaseStudyDetail(id));
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div class="rounded-lg border border-default bg-surface/80 px-3 py-2.5" data-testid="case-study-selector">
      <div class="mb-2 flex items-center gap-2">
        <Layers size={14} class="text-fero-green-dark" />
        <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Caso de estudio</p>
      </div>
      <SelectField
        label={
          props.context === 'operational'
            ? 'Acotar puntos del plan semanal'
            : 'Acotar puntos del experimento'
        }
        value={selectedValue()}
        onChange={handleChange}
        disabled={props.disabled || loadingDetail()}
      >
        <option value="">Modo legacy — todos los puntos activos</option>
        <For each={cases() ?? []}>
          {(item) => (
            <option value={item.id}>
              {item.code} · {item.activePointCount} pts
            </option>
          )}
        </For>
      </SelectField>
      <Show when={props.value}>
        {(study) => (
          <p class="mt-2 text-xs text-text-secondary">
            {study().name}
            <span class="text-text-muted"> · escenario default {study().defaultScenarioId}</span>
            <A href={`/case-studies/${study().id}`} class="ml-1 text-fero-blue hover:underline">
              Editar
            </A>
          </p>
        )}
      </Show>
      <Show when={!props.value}>
        <p class="mt-2 text-xs text-text-muted">
          {props.context === 'operational'
            ? 'Sin caso seleccionado: el plan semanal usa frecuencias de visita del catálogo.'
            : 'Sin caso seleccionado: el motor usa el catálogo operativo completo (compatibilidad legacy).'}
        </p>
      </Show>
    </div>
  );
}
