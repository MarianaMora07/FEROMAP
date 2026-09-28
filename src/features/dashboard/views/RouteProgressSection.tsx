import { CheckCircle2, Clock, Package } from 'lucide-solid';
import { Badge } from '../../design-system/components';

interface Stop {
  id: number;
  code: string;
  sector: string;
  address: string;
  status: 'completed' | 'current' | 'pending';
  time: string;
  collected: number;
}

const stopsData: Stop[] = [
  { id: 1, code: 'CNT-001', sector: 'Villa Betania', address: 'Calle 123 #45-67', status: 'completed', time: '06:30', collected: 120 },
  { id: 2, code: 'CNT-002', sector: 'Villa Betania', address: 'Calle 124 #45-67', status: 'completed', time: '06:45', collected: 95 },
  { id: 3, code: 'CNT-003', sector: 'Villa Ikabaru', address: 'Carrera 12 #34-56', status: 'completed', time: '07:15', collected: 110 },
  { id: 4, code: 'CNT-004', sector: 'Villa Ikabaru', address: 'Carrera 13 #34-56', status: 'current', time: '07:45', collected: 0 },
  { id: 5, code: 'CNT-005', sector: 'Unare I', address: 'Av. Principal #12-34', status: 'pending', time: '08:30', collected: 0 },
  { id: 6, code: 'CNT-006', sector: 'Unare I', address: 'Av. Principal #12-35', status: 'pending', time: '08:45', collected: 0 },
  { id: 7, code: 'CNT-007', sector: 'Unare II', address: 'Calle 5 #67-89', status: 'pending', time: '09:15', collected: 0 },
  { id: 8, code: 'CNT-008', sector: 'Unare II', address: 'Calle 6 #67-89', status: 'pending', time: '09:30', collected: 0 },
];

interface Stop {
  id: number;
  code: string;
  sector: string;
  address: string;
  status: 'completed' | 'current' | 'pending';
  time: string;
  collected: number;
}

function renderStop(stop: Stop) {
  const statusClass = stop.status === 'completed' ? 'bg-fero-green/10 border border-fero-green/30' :
    stop.status === 'current' ? 'bg-fero-blue/10 border border-fero-blue/30 animate-pulse' :
    'bg-slate-100 dark:bg-slate-800';

  const statusIcon = stop.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-fero-green-dark" /> :
    stop.status === 'current' ? <Clock className="w-5 h-5 text-fero-blue animate-spin" /> :
    <span className="w-2 h-2 rounded-full bg-slate-400" />;

  const badgeVariant = stop.status === 'completed' ? 'success' : stop.status === 'current' ? 'info' : 'outline';
  const badgeLabel = stop.status === 'completed' ? 'Completado' : stop.status === 'current' ? 'En curso' : 'Pendiente';

  return (
    <div key={stop.id} className="p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`flex items-center justify-center h-10 w-10 rounded-full ${statusClass}`}>
          {statusIcon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary dark:text-white truncate">{stop.code} - {stop.sector}</p>
          <p className="text-xs text-text-muted truncate">{stop.address}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-text-muted">
            <Clock className="w-4 h-4" />
            {stop.time}
          </span>
          {stop.collected > 0 && (
            <span className="flex items-center gap-1 text-fero-green-dark font-medium">
              <Package className="w-4 h-4" />
              {stop.collected} kg
            </span>
          )}
        </div>
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
      </div>
    </div>
  );
}

export function RouteProgressSection() {
  return (
    <div className="rounded-xl border border-default bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-default">
        <h3 className="font-semibold text-text-primary dark:text-white">Paradas de la ruta</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">TR-01</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-fero-green/10 border border-fero-green/30 px-2 py-0.5 text-xs font-medium text-fero-green-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-fero-green" />
            En ruta
          </span>
        </div>
      </div>

      <div className="divide-y divide-default">
        {stopsData.map(renderStop)}
      </div>
    </div>
  );
}