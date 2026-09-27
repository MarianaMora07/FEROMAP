import { Badge } from '../../design-system/components';
import { planningStatusLabel, planningStatusVariant } from '../../core/planning/planningUx';

interface PlanningStatusBadgeProps {
  status: string | null | undefined;
  class?: string;
}

export function PlanningStatusBadge(props: PlanningStatusBadgeProps) {
  return (
    <Badge variant={planningStatusVariant(props.status)} dot class={props.class}>
      {planningStatusLabel(props.status)}
    </Badge>
  );
}
