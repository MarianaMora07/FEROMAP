import { Button, TextField } from '../../../design-system/components';
import { mondayIso } from '../../../core/api/planning';

export interface HistoryFilterValues {
  weekStart: string;
  operationDate: string;
  incidentId: string;
}

interface PlanningHistoryFiltersProps {
  values: HistoryFilterValues;
  loading?: boolean;
  onChange: (patch: Partial<HistoryFilterValues>) => void;
  onSearchWeek: () => void;
  onSearchDay: () => void;
  onSearchIncident: () => void;
  onClear: () => void;
}

export function PlanningHistoryFilters(props: PlanningHistoryFiltersProps) {
  return (
    <div class="rounded-xl border border-border bg-surface/50 p-4 dark:border-dark-border dark:bg-dark-surface/30">
      <p class="mb-3 text-sm font-semibold text-text-primary dark:text-white">Buscar en historial</p>
      <div class="grid gap-3 md:grid-cols-3">
        <TextField
          label="Semana (lunes)"
          type="date"
          value={props.values.weekStart}
          onInput={(e) => props.onChange({ weekStart: e.currentTarget.value })}
        />
        <TextField
          label="Día de operación"
          type="date"
          value={props.values.operationDate}
          onInput={(e) => props.onChange({ operationDate: e.currentTarget.value })}
        />
        <TextField
          label="Incidencia #"
          type="number"
          min={1}
          value={props.values.incidentId}
          onInput={(e) => props.onChange({ incidentId: e.currentTarget.value })}
        />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={props.loading}
          onClick={props.onSearchWeek}
        >
          Buscar semana
        </Button>
        <Button size="sm" variant="outline" loading={props.loading} onClick={props.onSearchDay}>
          Buscar día
        </Button>
        <Button size="sm" variant="outline" loading={props.loading} onClick={props.onSearchIncident}>
          Buscar incidencia
        </Button>
        <Button size="sm" variant="outline" onClick={props.onClear}>
          Limpiar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => props.onChange({ weekStart: mondayIso() })}
        >
          Semana actual
        </Button>
      </div>
    </div>
  );
}
