import { createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { Line } from 'solid-chartjs';
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Card, CardHeader, ProgressBar, Badge } from '../../design-system/components';

Chart.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
);

export type MetricStatus = 'normal' | 'warning' | 'critical' | 'info';

const STATUS_CONFIG: Record<MetricStatus, { bg: string; border: string; text: string; iconBg: string; dot: string }> = {
  normal: {
    bg: 'bg-fero-green/5',
    border: 'border-fero-green/20',
    text: 'text-fero-green-dark',
    iconBg: 'bg-fero-green/10',
    dot: 'bg-fero-green',
  },
  warning: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    text: 'text-amber-700',
    iconBg: 'bg-amber-500/10',
    dot: 'bg-amber-500',
  },
  critical: {
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
    text: 'text-red-600',
    iconBg: 'bg-red-500/10',
    dot: 'bg-red-500',
  },
  info: {
    bg: 'bg-fero-blue/5',
    border: 'border-fero-blue/20',
    text: 'text-fero-blue',
    iconBg: 'bg-fero-blue/10',
    dot: 'bg-fero-blue',
  },
};

const ICONS: Record<MetricStatus, () => JSX.Element> = {
  normal: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  warning: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  critical: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  info: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status: MetricStatus;
  trend?: { value: number; label?: string };
  sparkline?: number[];
  action?: { label: string; href: string; onClick?: () => void };
  icon?: () => JSX.Element;
  className?: string;
  showProgress?: boolean;
  progressValue?: number;
  progressMax?: number;
  progressColor?: 'green' | 'blue' | 'amber' | 'red';
}

export function MetricCard({
  label,
  value,
  unit,
  status,
  trend,
  sparkline,
  action,
  icon,
  className = '',
  showProgress = false,
  progressValue,
  progressMax = 100,
  progressColor = 'green',
}: MetricCardProps) {
  const config = STATUS_CONFIG[status];
  const IconComponent = icon || ICONS[status];
  const hasSparkline = sparkline && sparkline.length > 0;

  const chartData = sparkline && sparkline.length > 1 ? {
    labels: Array.from({ length: sparkline.length }, (_, i) => i.toString()),
    datasets: [{
      data: sparkline,
      borderColor: status === 'critical' ? '#ef4444' :
                 status === 'warning' ? '#f59e0b' :
                 status === 'info' ? '#1143F3' : '#34D634',
      backgroundColor: status === 'critical' ? 'rgba(239,68,68,0.08)' :
                       status === 'warning' ? 'rgba(245,158,11,0.08)' :
                       status === 'info' ? 'rgba(17,67,243,0.08)' : 'rgba(52,214,52,0.08)',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.4,
      fill: true,
    }],
  } : null;

  return (
    <div className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${className}`}>
      <Card className={`relative ${config.bg} ${config.border} border`}>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-xl ${config.iconBg}`}>
                <IconComponent className={`w-5 h-5 ${config.text}`} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                <p className="font-heading text-xl font-bold text-text-primary dark:text-white">
                  {value}
                  {` `}{props.unit && <span className="text-lg font-medium text-text-muted">{props.unit}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className={`flex h-2 w-2 rounded-full ${config.dot} animate-pulse`} />
              {showProgress && progressValue !== undefined && (
                <ProgressBar
                  value={progressValue}
                  max={progressMax}
                  color={progressColor as 'green' | 'blue' | 'amber' | 'red'}
                  size="sm"
                  className="w-24"
                />
              )}
            </div>
          </div>

          {sparkline && sparkline.length > 1 && (
            <div className="h-12 -mx-4">
              <Line
                data={{
                  labels: Array.from({ length: sparkline.length }, (_, i) => i),
                  datasets: [{
                    data: sparkline,
                    borderColor: status === 'critical' ? '#ef4444' :
                               status === 'warning' ? '#f59e0b' :
                               status === 'info' ? '#1143F3' : '#34D634',
                    backgroundColor: status === 'critical' ? 'rgba(239,68,68,0.08)' :
                                     status === 'warning' ? 'rgba(245,158,11,0.08)' :
                                     status === 'info' ? 'rgba(17,67,243,0.08)' : 'rgba(52,214,52,0.08)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.4,
                    fill: true,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: false } },
                  interaction: { intersect: false },
                  scales: { x: { display: false }, y: { display: false } },
                  elements: { point: { radius: 0, hoverRadius: 4 } },
                }}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            {trend && (
              <div className={`flex items-center gap-1 text-xs font-semibold ${trend.value >= 0 ? 'text-fero-green-dark' : 'text-red-600'}`}>
                <span>{trend.value >= 0 ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
                <span className="text-text-muted ml-1">{trend.label || 'vs período anterior'}</span>
              </div>
            )}

            {action && (
              <a
                href={action.href}
                onClick={action.onClick}
                className="text-xs font-medium text-fero-blue underline-offset-2 hover:underline"
              >
                {action.label}
              </a>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}