import { Route, Router } from '@solidjs/router';
import { Suspense, lazy, type Component } from 'solid-js';
import { LoadingPanel } from '../design-system/components';
import { AppShell } from '../design-system/layout/AppShell';
import { AuthGate, GuestGate, RoleGate } from '../core/auth/AuthGate';

function PageFallback() {
  return (
    <LoadingPanel
      label="Cargando módulo…"
      indeterminate
      detail="Preparando la vista solicitada."
    />
  );
}

function lazyPage(loader: () => Promise<{ default: Component }>) {
  const Page = lazy(loader);
  return function LazyPage() {
    return (
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    );
  };
}

const DashboardPage = lazyPage(() => import('../features/dashboard'));
const OptimizationPage = lazyPage(() => import('../features/optimization'));
const MapPage = lazyPage(() => import('../features/map'));
const VehiclesPage = lazyPage(() => import('../features/vehicles'));
const DriversPage = lazyPage(() => import('../features/drivers'));
const CollectionPointsPage = lazyPage(() => import('../features/collection-points'));
const SimulationPage = lazyPage(() => import('../features/simulation'));
const MonitoringPage = lazyPage(() => import('../features/monitoring'));
const AnalyticsPage = lazyPage(() => import('../features/analytics'));
const ReportsPage = lazyPage(() => import('../features/reports'));
const AlertsPage = lazyPage(() => import('../features/alerts'));
const AdminPage = lazyPage(() => import('../features/admin'));
const ResidentPage = lazyPage(() => import('../features/resident'));
const ProfilePage = lazyPage(() => import('../features/profile'));
const LoginPage = lazyPage(() => import('../features/auth'));

function ProtectedShell(props: { children: unknown }) {
  return (
    <AuthGate>
      <RoleGate>
        <AppShell>{props.children}</AppShell>
      </RoleGate>
    </AuthGate>
  );
}

export default function App() {
  return (
    <Router>
      <Route
        path="/login"
        component={() => (
          <GuestGate>
            <LoginPage />
          </GuestGate>
        )}
      />
      <Route path="/" component={ProtectedShell}>
        <Route path="/" component={DashboardPage} />
        <Route path="/optimization" component={OptimizationPage} />
        <Route path="/map" component={MapPage} />
        <Route path="/vehicles" component={VehiclesPage} />
        <Route path="/drivers" component={DriversPage} />
        <Route path="/collection-points" component={CollectionPointsPage} />
        <Route path="/simulation" component={SimulationPage} />
        <Route path="/monitoring" component={MonitoringPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/resident" component={ResidentPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/profile" component={ProfilePage} />
      </Route>
    </Router>
  );
}
