import { Show } from 'solid-js';
import { Badge } from '../../design-system/components';

interface VehicleOptimizationBadgesProps {
  usedInLastOptimization?: boolean;
  compact?: boolean;
}

export function VehicleOptimizationBadges(props: VehicleOptimizationBadgesProps) {
  return (
    <Show when={props.usedInLastOptimization}>
      <div class={props.compact ? '' : 'mt-1'}>
        <Badge variant="info" size="sm">
          Usado en última optimización
        </Badge>
      </div>
    </Show>
  );
}
