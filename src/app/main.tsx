import '../design-system/tokens.css';
import { render } from 'solid-js/web';
import App from './App';
import { initRoadSnappedRoutes } from '../core/stores/appStore';
import { initSimulationData } from '../core/stores/simulationStore';

void initRoadSnappedRoutes();
void initSimulationData();

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
