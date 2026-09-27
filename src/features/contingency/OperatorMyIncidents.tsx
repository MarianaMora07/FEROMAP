import { For, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle } from 'lucide-solid';
import { Card, CardHeader } from '../../design-system/components';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import {
  formatOperatorIncidentWhen,
  incidentAlertHref,
  incidentTypeLabel,
} from '../../core/operator/operatorContingencyUx';

interface OperatorMyIncidentsProps {
  vehicleId?: string | null;
  refreshKey?: number;
  readOnly?: boolean;
}

export function OperatorMyIncidents(props: OperatorMyIncidentsProps) {
  const [incidents, { refetch }] = createResource(
    () => `${props.vehicleId ?? 'all'}:${props.refreshKey ?? 0}`,
    () =>
      fetchRecentIncidents({
        vehicleId: props.vehicleId ?? undefined,
        hours: 48,
        limit: 5,
      }),
  );

  return (
    <Card data-testid="operator-my-incidents">
      <CardHeader
        title="Mis incidencias"
        subtitle="Hoy y últimas 48 horas"
        action={
          <button
            type="button"
            class="text-xs font-medium text-fero-blue hover:underline"
            onClick={() => void refetch()}
          >
            Actualizar
          </button>
        }
      />

      <Show when={incidents.loading}>
        <p class="text-sm text-text-muted">Cargando incidencias…</p>
      </Show>

      <Show when={!incidents.loading && (incidents() ?? []).length === 0}>
        <p class="text-sm text-text-secondary">
          {props.readOnly
            ? 'No reportaste incidencias en esta jornada.'
            : 'No has reportado incidencias recientes. Usa «Reportar avería» si necesitas ayuda en ruta.'}
        </p>
      </Show>

      <Show when={!incidents.loading && (incidents() ?? []).length > 0}>
        <ul class="divide-y divide-border dark:divide-dark-border">
          <For each={incidents()}>
            {(incident) => {
              const alertHref = () => incidentAlertHref(incident);
              return (
                <li class="flex gap-3 py-3 first:pt-0">
                  <AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-text-primary dark:text-white">
                      #{incident.id} · {incidentTypeLabel(incident.incidentType)}
                    </p>
                    <p class="text-xs text-text-secondary">
                      {incident.vehicleId} · {formatOperatorIncidentWhen(incident.reportedAt)}
                    </p>
                    <Show when={incident.description}>
                      <p class="mt-1 text-xs text-text-muted">{incident.description}</p>
                    </Show>
                    <Show when={alertHref()}>
                      {(href) => (
                        <A href={href()} class="mt-1 inline-block text-xs font-semibold text-fero-blue hover:underline">
                          Ver alerta relacionada
                        </A>
                      )}
                    </Show>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </Card>
  );
}
