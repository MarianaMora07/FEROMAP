import { For, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, Car, ChevronDown, CloudRain, Trash2, Truck } from 'lucide-solid';
import { Card, CardHeader, ProgressBar } from '../../design-system/components';
import type { MonitoringAlertItem, RouteProgressItem } from '../../core/api/monitoring';
import type { LiveActivity } from '../../core/types/mapContext';
import { currentConditions } from '../../data/mock/monitoring';

const activityTone = {
  success: 'bg-fero-green/15 text-fero-green-dark',
  info: 'bg-fero-blue/10 text-fero-blue',
  warning: 'bg-amber-100 text-amber-600',
  danger: 'bg-red-50 text-red-500',
  default: 'bg-app text-slate-500',
};

const routeBarColor = {
  green: 'green' as const,
  blue: 'blue' as const,
  purple: 'green' as const,
  amber: 'amber' as const,
};

interface MonitoringContextPanelProps {
  activities: LiveActivity[];
  routeProgress: RouteProgressItem[];
  alerts: MonitoringAlertItem[];
}

export function MonitoringContextPanel(props: MonitoringContextPanelProps) {
  const summaryHint = () => {
    const routes = props.routeProgress.length;
    const alerts = props.alerts.length;
    return `${routes} ruta${routes === 1 ? '' : 's'} · ${alerts} alerta${alerts === 1 ? '' : 's'} · ${currentConditions.weather.label}`;
  };

  return (
    <details
      class="group rounded-xl border border-default bg-elevated shadow-xs"
      data-testid="monitoring-context-panel"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">Más contexto operativo</p>
          <p class="mt-0.5 truncate text-xs text-text-muted">{summaryHint()}</p>
        </div>
        <ChevronDown
          size={18}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div class="grid gap-4 border-t border-default p-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Actividades en tiempo real" />
          <ul class="space-y-3">
            <For each={props.activities}>
              {(a) => (
                <li class="flex gap-2.5">
                  <span
                    class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${activityTone[a.tone]}`}
                  >
                    <ActivityDot tone={a.tone} />
                  </span>
                  <div class="min-w-0">
                    <p class="text-[11px] text-text-muted">{a.time}</p>
                    <p class="text-sm text-text-secondary">{a.text}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Progreso por ruta" />
          <ul class="space-y-3.5">
            <For each={props.routeProgress}>
              {(r) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="font-medium text-text-primary">{r.label}</span>
                    <span class="text-xs text-text-muted">
                      {r.done}/{r.total} · {r.pct}%
                    </span>
                  </div>
                  <ProgressBar value={r.pct} color={routeBarColor[r.color]} size="sm" />
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Alertas e incidencias" />
          <ul class="space-y-3">
            <For each={props.alerts}>
              {(al) => (
                <li class="flex gap-2.5">
                  <span
                    class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      al.tone === 'danger' ? 'bg-red-50 text-red-500' : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    <AlertTriangle size={14} />
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text-primary">{al.title}</p>
                    <p class="text-xs text-text-secondary">{al.detail}</p>
                    <p class="mt-0.5 text-[11px] text-text-muted">{al.time}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Condiciones actuales" />
          <ul class="space-y-3">
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-fero-blue/10 text-fero-blue">
                <CloudRain size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Clima</p>
                <p class="text-sm font-semibold text-text-primary">
                  {currentConditions.weather.label} · {currentConditions.weather.tempC}°C
                </p>
              </div>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Car size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Tráfico</p>
                <p class="text-sm font-semibold text-text-primary">{currentConditions.traffic}</p>
              </div>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <AlertTriangle size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Vías afectadas</p>
                <p class="text-sm font-semibold text-text-primary">{currentConditions.affectedRoads}</p>
              </div>
            </li>
          </ul>
          <A href="/map" class="mt-4 inline-flex text-sm font-medium text-fero-blue hover:underline">
            Ver en mapa GIS
          </A>
        </Card>
      </div>
    </details>
  );
}

function ActivityDot(props: { tone: keyof typeof activityTone }) {
  const icon: Record<keyof typeof activityTone, () => JSX.Element> = {
    success: () => <Trash2 size={12} />,
    info: () => <Truck size={12} />,
    warning: () => <Car size={12} />,
    danger: () => <AlertTriangle size={12} />,
    default: () => <Truck size={12} />,
  };
  return icon[props.tone]();
}
