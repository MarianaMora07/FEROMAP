import '../design-system/tokens.css';
import { render } from 'solid-js/web';
import App from './App';
import { initRoadSnappedRoutes } from '../core/stores/appStore';

initRoadSnappedRoutes();

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
