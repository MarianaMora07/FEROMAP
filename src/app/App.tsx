import { Route, Router } from '@solidjs/router';
import { lazy } from 'solid-js';
import { AppShell } from '../design-system/layout/AppShell';

const DashboardPage = lazy(() => import('../features/dashboard'));
const OptimizationPage = lazy(() => import('../features/optimization'));
const MapPage = lazy(() => import('../features/map'));
const VehiclesPage = lazy(() => import('../features/vehicles'));
const CollectionPointsPage = lazy(() => import('../features/collection-points'));
const SimulationPage = lazy(() => import('../features/simulation'));
const MonitoringPage = lazy(() => import('../features/monitoring'));
const AnalyticsPage = lazy(() => import('../features/analytics'));
const ReportsPage = lazy(() => import('../features/reports'));
const AlertsPage = lazy(() => import('../features/alerts'));
const AdminPage = lazy(() => import('../features/admin'));
const ProfilePage = lazy(() => import('../features/profile'));
const LoginPage = lazy(() => import('../features/auth'));

export default function App() {
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route
        path="/"
        component={(props) => (
          <AppShell>
            {props.children}
          </AppShell>
        )}
      >
        <Route path="/" component={DashboardPage} />
        <Route path="/optimization" component={OptimizationPage} />
        <Route path="/map" component={MapPage} />
        <Route path="/vehicles" component={VehiclesPage} />
        <Route path="/collection-points" component={CollectionPointsPage} />
        <Route path="/simulation" component={SimulationPage} />
        <Route path="/monitoring" component={MonitoringPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/profile" component={ProfilePage} />
      </Route>
    </Router>
  );
}
