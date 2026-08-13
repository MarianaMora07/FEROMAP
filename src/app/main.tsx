import '../design-system/tokens.css';
import { render } from 'solid-js/web';
import App from './App';
import { logMockModeEnabled } from '../core/api/mockFallback';
import { getStoredThemePreference } from '../core/theme/themePreference';
import { initAppData, applyThemePreference } from '../core/stores/appStore';
import { initSimulationData } from '../core/stores/simulationStore';
import { initAuth } from '../core/stores/authStore';

logMockModeEnabled();

// Sincroniza store con clase ya aplicada en index.html (anti-flash).
applyThemePreference(getStoredThemePreference());

void initAuth();
void initAppData();
void initSimulationData();

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
