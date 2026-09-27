import { Navigate, Route, Router } from '@solidjs/router';
import { Suspense, lazy, type Component, type JSX } from 'solid-js';
import { LoadingPanel } from '../design-system/components';
import { AppShell } from '../design-system/layout/AppShell';
import { AuthGate, GuestGate, RoleGate } from '../core/auth/AuthGate';
import { CALIBRATION_ROUTE, EVIDENCE_ROUTE } from '../core/auth/permissions';

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
const DaySimulationPage = lazyPage(() => import('../features/optimization/DaySimulationPage'));
const MapPage = lazyPage(() => import('../features/map'));
const VehiclesPage = lazyPage(() => import('../features/vehicles'));
const DriversPage = lazyPage(() => import('../features/drivers'));
const CollectionPointsPage = lazyPage(() => import('../features/collection-points'));
const CaseStudiesListPage = lazyPage(() => import('../features/case-studies'));
const CaseStudyEditorPage = lazyPage(() => import('../features/case-studies/CaseStudyEditorPage'));
const SimulationPage = lazyPage(() => import('../features/simulation'));
const DemostracionPage = lazyPage(() => import('../features/demostracion'));
const MonitoringPage = lazyPage(() => import('../features/monitoring'));
const AnalyticsPage = lazyPage(() => import('../features/analytics'));
const ReportsPage = lazyPage(() => import('../features/reports'));
const AlertsPage = lazyPage(() => import('../features/alerts'));
const AdminPage = lazyPage(() => import('../features/admin'));
const SettingsPage = lazyPage(() => import('../features/settings'));
const CalibrationPage = lazyPage(() => import('../features/settings/CalibrationPage'));
const EvidencePage = lazyPage(() => import('../features/evidence'));
const ResidentPage = lazyPage(() => import('../features/resident'));
const ProfilePage = lazyPage(() => import('../features/profile'));
const OperatorPage = lazyPage(() => import('../features/operator'));
const OperatorDailyPlanPage = lazyPage(() => import('../features/operator/OperatorDailyPlanPage'));
const OperatorNotificationsPage = lazyPage(
  () => import('../features/operator/OperatorNotificationsPage'),
);
const OperatorWeekPage = lazyPage(() => import('../features/operator/OperatorWeekPage'));
const PlanningWeeklyPage = lazyPage(() => import('../features/planning/weekly'));
const WeeklyPlansListPage = lazyPage(() => import('../features/planning/weeks'));
const PlanningHistoryPage = lazyPage(() => import('../features/planning/history'));
const LoginPage = lazyPage(() => import('../features/auth'));

function ProtectedShell(props: { children?: JSX.Element }) {
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
        <Route path="/optimization/simulation" component={DaySimulationPage} />
        {/* URL legada (andamiaje de tesis): redirige al plan semanal. */}
        <Route path="/optimization/levels" component={() => <Navigate href="/planning/weekly" />} />
        <Route path="/operator" component={OperatorPage} />
        <Route path="/operator/plan" component={OperatorDailyPlanPage} />
        <Route path="/operator/notifications" component={OperatorNotificationsPage} />
        <Route path="/operator/week" component={OperatorWeekPage} />
        <Route path="/planning" component={() => <Navigate href="/" />} />
        <Route path="/planning/weekly" component={PlanningWeeklyPage} />
        <Route path="/planning/weeks" component={WeeklyPlansListPage} />
        <Route path="/planning/history" component={PlanningHistoryPage} />
        <Route path="/map" component={MapPage} />
        <Route path="/vehicles" component={VehiclesPage} />
        <Route path="/drivers" component={DriversPage} />
        <Route path="/collection-points" component={CollectionPointsPage} />
        <Route path="/case-studies" component={CaseStudiesListPage} />
        <Route path="/case-studies/:id" component={CaseStudyEditorPage} />
        <Route path="/simulation" component={SimulationPage} />
        <Route path="/demostracion" component={DemostracionPage} />
        <Route path="/monitoring" component={MonitoringPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/resident" component={ResidentPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path={CALIBRATION_ROUTE} component={CalibrationPage} />
        <Route path={EVIDENCE_ROUTE} component={EvidencePage} />
        <Route path="/profile" component={ProfilePage} />
      </Route>
    </Router>
  );
}
