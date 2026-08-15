interface RoutePlaybackLegendProps {
  class?: string;
}

export function RoutePlaybackLegend(props: RoutePlaybackLegendProps) {
  return (
    <div
      class={`rounded-md border border-default bg-elevated/95 p-2.5 text-xs shadow-md backdrop-blur-sm ${props.class ?? ''}`}
      data-testid="route-playback-legend"
      aria-label="Leyenda de simulación de recorrido"
    >
      <p class="mb-1.5 font-semibold text-text-primary">Recorrido simulado</p>
      <ul class="space-y-1.5 text-text-secondary">
        <li class="flex items-center gap-2">
          <span class="h-0.5 w-6 rounded-full bg-fero-green" aria-hidden="true" />
          Ruta recorrida
        </li>
        <li class="flex items-center gap-2">
          <span
            class="h-0.5 w-6 rounded-full border border-dashed border-text-muted bg-transparent"
            aria-hidden="true"
          />
          Ruta pendiente
        </li>
        <li class="flex items-center gap-2">
          <span class="text-sm" aria-hidden="true">
            🚛
          </span>
          Camión en movimiento
        </li>
        <li class="flex items-center gap-2">
          <span
            class="flex h-4 w-4 items-center justify-center rounded-full border border-fero-blue text-[9px] font-bold text-fero-blue"
            aria-hidden="true"
          >
            ●
          </span>
          Parada siguiente
        </li>
        <li class="flex items-center gap-2">
          <span
            class="flex h-4 w-4 items-center justify-center rounded-full border border-fero-green text-[9px] font-bold text-fero-green-dark"
            aria-hidden="true"
          >
            ✓
          </span>
          Parada completada
        </li>
      </ul>
    </div>
  );
}
