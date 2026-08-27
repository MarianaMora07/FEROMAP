import { Show } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import { AcoConvergenceChart } from '../simulation/AcoConvergenceChart';
import type { AcoConvergencePoint } from '../../data/types/simulation';

interface OptimizationConvergencePanelProps {
  points: AcoConvergencePoint[];
}

export function OptimizationConvergencePanel(props: OptimizationConvergencePanelProps) {
  return (
    <Show when={props.points.length > 0}>
      <Card data-testid="optimization-convergence-panel">
        <CardHeader
          title="Convergencia ACO"
          subtitle="El algoritmo mejora la distancia iteración a iteración hasta estabilizarse"
        />
        <AcoConvergenceChart points={props.points} compact />
      </Card>
    </Show>
  );
}
