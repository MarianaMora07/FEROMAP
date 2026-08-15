import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackPanel } from '../route-playback/RoutePlaybackPanel';
import type { ScenarioId } from '../../data/types/simulation';

interface OptimizationPlaybackPanelProps {
  routes: RoutePlaybackModel[];
  playback: RoutePlaybackController;
  scenarioId: ScenarioId;
  scenarioLabel: string;
  operationDate: string;
  previewMode?: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

export function OptimizationPlaybackPanel(props: OptimizationPlaybackPanelProps) {
  return <RoutePlaybackPanel {...props} variant="overlay" title="Simular recorrido" />;
}
