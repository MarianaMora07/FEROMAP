import { Show } from 'solid-js';
import { Badge } from '../../design-system/components';

interface CollectionPointOptimizationBadgesProps {
  usedInLastOptimization?: boolean;
  priorityBoost?: boolean;
  compact?: boolean;
}

export function CollectionPointOptimizationBadges(props: CollectionPointOptimizationBadgesProps) {
  return (
    <Show when={props.usedInLastOptimization || props.priorityBoost}>
      <div class={`flex flex-wrap gap-1 ${props.compact ? '' : 'mt-1'}`}>
        <Show when={props.usedInLastOptimization}>
          <Badge variant="info" size="sm">
            Usado en última optimización
          </Badge>
        </Show>
        <Show when={props.priorityBoost}>
          <Badge variant="warning" size="sm">
            Próxima optimización
          </Badge>
        </Show>
      </div>
    </Show>
  );
}
