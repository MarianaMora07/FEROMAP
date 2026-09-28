import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { AlertTriangle, Calendar, CheckCircle, Clock, Home, Leaf, MapPin, Package, Recycle, Shield, Truck, AlertCircle, CheckCircle2, XCircle, MapPin as MapPinIcon, Bell, ShieldCheck, CalendarDays, Trash2, Package as PackageIcon, Leaf as LeafIcon, Recycle as RecycleIcon } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard, ProgressBar, Badge } from '../../design-system/components';
import { fetchDashboardSummary } from '../../core/api/dashboard';
import { SparklineKpiCard, MetricCard, LineChart, DoughnutChart, BarChart } from '../components';

export function ResidentDashboard() {
  return (
    <div className="space-y-4 md:space-y-5" data-testid="resident-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-text-primary dark:text-white">Mi Sector</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Información de recolección y estado de contenedores en tu zona
          </p>
        </div>
      </div>

      <ScheduleCard />
      <SectorStatusCard />
      <ContainersCard />
      <NotificationsCard />
      <TipsCard />
    </div>
  );
}

function ScheduleCard() {
  const nextCollection = 'Mañana, 28 de septiembre';
  const collectionDays = ['Lunes', 'Miércoles', 'Viernes'];
  const schedule = [
    { day: 'Lunes', type: 'Orgánico', icon: <Leaf className="w-4 h-4" />, color: 'bg-fero-green/10 text-fero-green-dark' },
    { day: 'Miércoles', type: 'Reciclable', icon: <Recycle className="w-4 h-4" />, color: 'bg-fero-blue/10 text-fero-blue' },
    { day: 'Viernes', type: 'Orgánico', icon: <Leaf className="w-4 h-4" />, color: 'bg-fero-green/10 text-fero-green-dark' },
  ];

  const today = new Date().getDay();
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const isCollectionToday = collectionDays.includes(dayNames[today]);
  const nextCollectionDay = collectionDays.find(d => dayNames.indexOf(d) > today) || collectionDays[0];

  return (
    <div className="rounded-xl border border-default bg-surface overflow-hidden">
      <div className="p-4 border-b border-default">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-fero-blue/10 border border-fero-blue/30 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-fero-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary dark:text-white">Calendario de recolección</h3>
              <p className="text-sm text-text-muted">Sector: Villa Betania</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isCollectionToday ? 'success' : 'outline'} className="gap-1">
              <Clock className="w-3 h-3" />
              {isCollectionToday ? '¡Hoy hay recolección!' : `Próxima: ${nextCollectionDay}`}
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-fero-green/5 border border-fero-green/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-fero-green/10 border border-fero-green/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-fero-green-dark" />
            </div>
            <div>
              <p className="font-semibold text-text-primary dark:text-white">Próxima recolección</p>
              <p className="text-sm text-text-muted">{isCollectionToday ? 'Hoy' : nextCollectionDay}, 06:00 - 10:00</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-fero-green-dark">{isCollectionToday ? '¡Hoy!' : 'Mañana'}</p>
            <p className="text-xs text-text-muted">06:00 - 10:00</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {schedule.map((day, i) => (
            <div key={day.day} className="rounded-xl border border-default bg-surface p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`inline-flex items-center justify-center h-8 w-8 rounded-xl ${day.color}`}>
                  {day.icon}
                </div>
                <div>
                  <p className="font-semibold text-text-primary dark:text-white">{day.day}</p>
                  <p className="text-xs text-text-muted">Recolección programada</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Horario</span>
                  <span className="font-medium">06:00 - 10:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Tipo</span>
                  <Badge variant="outline" className="gap-1">
                    {day.icon}
                    {day.type}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Frecuencia</span>
                  <span className="font-medium">Semanal</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-default">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Días de recolección esta semana</span>
            <Badge variant="outline">3 días</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectorStatusCard() {
  const containers = [
    { id: 'CNT-001', type: 'Orgánico', fill: 45, status: 'normal', address: 'Calle 123 #45-67' },
    { id: 'CNT-002', type: 'Reciclable', fill: 72, status: 'warning', address: 'Calle 124 #45-67' },
    { id: 'CNT-003', type: 'Orgánico', fill: 28, status: 'normal', address: 'Carrera 12 #34-56' },
    { id: 'CNT-004', type: 'No reciclable', fill: 88, status: 'critical', address: 'Carrera 13 #34-56' },
    { id: 'CNT-005', type: 'Orgánico', fill: 15, status: 'normal', address: 'Av. Principal #12-34' },
    { id: 'CNT-006', type: 'Reciclable', fill: 65, status: 'warning', address: 'Av. Principal #12-35' },
  ];

  const criticalCount = containers.filter(c => c.status === 'critical').length;
  const warningCount = containers.filter(c => c.status === 'warning').length;
  const normalCount = containers.filter(c => c.status === 'normal').length;

  return (
    <div className="rounded-xl border border-default bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-default">
        <h3 className="font-semibold text-text-primary dark:text-white">Estado de contenedores en tu sector</h3>
        <Badge variant="outline">Villa Betania</Badge>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Contenedores normales"
            value={3}
            status="normal"
            sparkline={[8, 7, 9, 7, 8, 9, 8]}
          />
          <MetricCard
            label="En riesgo"
            value={2}
            status="warning"
            sparkline={[1, 2, 1, 2, 1, 2, 2]}
          />
          <MetricCard
            label="Críticos"
            value={1}
            status="critical"
            sparkline={[0, 1, 0, 1, 0, 1, 1]}
          />
        </div>

        <div className="space-y-2">
          {[
            { id: 'CNT-004', type: 'No reciclable', fill: 88, status: 'critical', address: 'Carrera 13 #34-56' },
            { id: 'CNT-002', type: 'Reciclable', fill: 72, status: 'warning', address: 'Calle 124 #45-67' },
            { id: 'CNT-006', type: 'Reciclable', fill: 65, status: 'warning', address: 'Av. Principal #12-35' },
            { id: 'CNT-001', type: 'Orgánico', fill: 45, status: 'normal', address: 'Calle 123 #45-67' },
            { id: 'CNT-003', type: 'Orgánico', fill: 28, status: 'normal', address: 'Carrera 12 #34-56' },
            { id: 'CNT-005', type: 'Orgánico', fill: 15, status: 'normal', address: 'Av. Principal #12-34' },
          ].map((c) => (
            <div key={c.id} className="rounded-lg border border-default bg-surface/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    c.status === 'critical' ? 'bg-red-500/10 border border-red-500/30' :
                    c.status === 'warning' ? 'bg-amber-500/10 border border-amber-500/30' :
                    'bg-fero-green/10 border border-fero-green/30'
                  }`}>
                    {c.type === 'Orgánico' && <Leaf className={`w-5 h-5 ${c.status === 'critical' ? 'text-red-600' : c.status === 'warning' ? 'text-amber-600' : 'text-fero-green-dark'}`} />}
                    {c.type === 'Reciclable' && <Recycle className={`w-5 h-5 ${c.status === 'critical' ? 'text-red-600' : c.status === 'warning' ? 'text-amber-600' : 'text-fero-blue'}`} />}
                    {c.type === 'No reciclable' && <Trash2 className={`w-5 h-5 ${c.status === 'critical' ? 'text-red-600' : 'text-slate-600'}`} />}
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">{c.id}</p>
                    <p className="text-xs text-text-muted">{c.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`text-xl font-bold ${c.status === 'critical' ? 'text-red-600' : c.status === 'warning' ? 'text-amber-600' : 'text-fero-green-dark'}`}>{c.fill}%</p>
                    <p className="text-xs text-text-muted">Llenado</p>
                  </div>
                  <Badge variant={
                    c.status === 'critical' ? 'destructive' :
                    c.status === 'warning' ? 'warning' : 'success'
                  }>
                    {c.status === 'critical' ? 'Crítico' : c.status === 'warning' ? 'En riesgo' : 'Normal'}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 text-xs text-text-muted flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {c.type}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Mañana 06:00
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContainersCard() {
  return (
    <div className="rounded-xl border border-default bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-default">
        <h3 className="font-semibold text-text-primary dark:text-white">Tus contenedores cercanos</h3>
        <Badge variant="outline">6 contenedores</Badge>
      </div>
      <div className="p-4 space-y-3">
        {[
          { id: 'CNT-001', type: 'Orgánico', fill: 45, address: 'Calle 123 #45-67', dist: '50 m' },
          { id: 'CNT-002', type: 'Reciclable', fill: 72, address: 'Calle 124 #45-67', dist: '120 m' },
          { id: 'CNT-003', type: 'Orgánico', fill: 28, address: 'Carrera 12 #34-56', dist: '200 m' },
          { id: 'CNT-004', type: 'No reciclable', fill: 88, address: 'Carrera 13 #34-56', dist: '300 m' },
        ].map((c) => (
          <div key={c.id} className="rounded-lg border border-default bg-surface/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-fero-green/10 border border-fero-green/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-fero-green-dark" />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{c.id}</p>
                  <p className="text-xs text-text-muted">{c.address}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xl font-bold text-fero-green-dark">{c.fill}%</p>
                  <p className="text-xs text-text-muted">Llenado</p>
                </div>
                <Badge variant={c.fill > 80 ? 'destructive' : c.fill > 60 ? 'warning' : 'success'}>
                  {c.fill > 80 ? 'Crítico' : c.fill > 60 ? 'En riesgo' : 'Normal'}
                </Badge>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {c.type === 'Orgánico' && <Leaf className="w-3 h-3" />}
                {c.type === 'Reciclable' && <Recycle className="w-3 h-3" />}
                {c.type === 'No reciclable' && <Trash2 className="w-3 h-3" />}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {c.dist}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsCard() {
  const notifications = [
    { id: 1, title: 'Recolección mañana', message: 'Mañana 28 de septiembre hay recolección de orgánico en tu sector. Saca los contenedores antes de las 6:00 AM.', time: 'Hace 2 horas', type: 'info', read: false },
    { id: 2, title: 'Contenedor crítico cerca', message: 'El contenedor CNT-004 (Carrera 13 #34-56) ha alcanzado 88% de llenado. Se recolectará mañana.', time: 'Hace 5 horas', type: 'warning', read: false },
    { id: 3, title: 'Cambio de horario', message: 'A partir de la próxima semana, la recolección de reciclables pasa a los jueves.', time: 'Ayer', type: 'info', read: true },
    { id: 4, title: 'Nuevo contenedor', message: 'Se ha instalado un nuevo contenedor de reciclables en Av. Principal #12-35.', time: 'Hace 2 días', type: 'info', read: true },
  ];

  return (
    <div className="rounded-xl border border-default bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-default">
        <h3 className="font-semibold text-text-primary dark:text-white">Notificaciones</h3>
        <Badge variant="outline">3 sin leer</Badge>
      </div>
      <div className="divide-y divide-default">
        {notifications.map((n) => (
          <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.read ? 'bg-blue-500/5' : ''}`}>
            <div className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${
              n.type === 'warning' ? 'bg-amber-500/10 border border-amber-500/30' :
              n.type === 'info' ? 'bg-fero-blue/10 border border-fero-blue/30' :
              'bg-fero-green/10 border border-fero-green/30'
            }`}>
              {n.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {n.type === 'info' && <Bell className="w-5 h-5 text-fero-blue" />}
              {n.type === 'success' && <CheckCircle2 className="w-5 h-5 text-fero-green-dark" />}
            </div>
            <div className="flex-1 min-w-0 ml-3">
              <div className="flex items-start justify-between gap-2">
                <p className={`font-semibold text-text-primary ${!n.read ? 'font-bold' : ''}`}>{n.title}</p>
                <span className="text-xs text-text-muted shrink-0 ml-2">{n.time}</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{n.message}</p>
            </div>
            <div className="flex-shrink-0 ml-2">
              {!n.read && <Badge variant="outline" className="text-xs">Nuevo</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TipsCard() {
  const tips = [
    { icon: <Leaf className="w-5 h-5" />, title: 'Separa los orgánicos', desc: 'Los residuos orgánicos van en el contenedor verde. Evita bolsas plásticas.', color: 'text-fero-green-dark', bg: 'bg-fero-green/10 border-fero-green/30' },
    { icon: <Recycle className="w-5 h-5" />, title: 'Reciclables limpios', desc: 'Lava envases antes de reciclar. No mezcles vidrio roto con otros materiales.', color: 'text-fero-blue', bg: 'bg-fero-blue/10 border-fero-blue/30' },
    { icon: <Trash2 className="w-5 h-5" />, title: 'No reciclables', desc: 'Pañales, cerámica, espejos y papel sucio van en el contenedor gris.', color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800 border-slate-300' },
    { icon: <Calendar className="w-5 h-5" />, title: 'Horarios fijos', desc: 'Saca los contenedores la noche anterior. Horario: 6:00 - 10:00 AM.', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/30' },
  ];

  return (
    <div className="rounded-xl border border-default bg-surface">
      <div className="p-4 border-b border-default">
        <h3 className="font-semibold text-text-primary dark:text-white">Consejos de reciclaje</h3>
      </div>
      <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tips.map((tip, i) => (
          <div key={i} className={`rounded-xl border border-default bg-surface/50 p-4 ${tip.bg}`}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/50 dark:bg-slate-800/50 flex items-center justify-center">
                <tip.icon className={`w-5 h-5 ${tip.color}`} />
              </div>
              <div>
                <p className="font-semibold text-text-primary dark:text-white">{tip.title}</p>
                <p className="text-sm text-text-muted mt-1">{tip.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}