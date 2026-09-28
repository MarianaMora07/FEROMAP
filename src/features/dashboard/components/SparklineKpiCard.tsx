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
import { Card, CardHeader } from '../../design-system/components';

Chart.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
);

export interface SparklineKpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend: number;
  sparkline: number[];
  icon: () => JSX.Element;
  iconTone: 'green' | 'blue' | 'amber' | 'red' | 'purple';
  trendLabel?: string;
  onClick?: () => void;
  className?: string;
}

const TONE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: 'bg-fero-green/10', border: 'border-fero-green/30', text: 'text-fero-green-dark' },
  blue: { bg: 'bg-fero-blue/10', border: 'border-fero-blue/30', text: 'text-fero-blue' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-600' },
  purple: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600' },
};

const ICON_SIZES = {
  green: 'text-fero-green-dark',
  blue: 'text-fero-blue',
  amber: 'text-amber-600',
  red: 'text-red-600',
  purple: 'text-violet-600',
};

export function SparklineKpiCard({
  title,
  value,
  unit,
  trend,
  sparkline,
  icon,
  iconTone,
  trendLabel = 'vs período anterior',
  onClick,
  className = '',
}: SparklineKpiCardProps) {
  const colors = TONE_COLORS[iconTone] || TONE_COLORS.green;
  const iconColor = ICON_SIZES[iconTone] || ICON_SIZES.green;
  const trendColor = trend >= 0 ? 'text-fero-green-dark' : 'text-red-600';
  const trendIcon = trend >= 0 ? '↑' : '↓';

  const chartData = createMemo(() => ({
    labels: sparkline.map((_, i) => i.toString()),
    datasets: [
      {
        data: sparkline,
        borderColor: TONE_COLORS[iconTone]?.border.replace('border-', '') || '#34D634',
        backgroundColor: TONE_COLORS[iconTone]?.bg.replace('bg-', '').replace('/10', '15') || 'rgba(52,214,52,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.4,
        fill: true,
      },
    ],
  }));

  const sparklineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    interaction: { intersect: false, mode: 'index' },
    scales: { x: { display: false }, y: { display: false } },
    elements: { point: { radius: 0 } },
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/50 to-transparent" />
      <div className="relative p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex items-center gap-2 ${colors.bg} ${colors.border} rounded-xl p-2`}>
            <span className={`text-2xl ${iconColor}`}>{icon()}</span>
          </div>
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? 'text-fero-green-dark' : 'text-red-600'}`}>
            <span>{trend >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(trend)}%</span>
            <span className="text-text-muted ml-1">{trendLabel}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
          <div className="flex items-baseline gap-1">
            <p className="font-heading text-2xl font-bold text-text-primary dark:text-white">
              {value}
              {unit && <span className="text-lg font-medium text-text-muted ml-1">{unit}</span>}
            </p>
          </div>
        </div>

        <div className="h-16 -mx-4">
          <Line
            data={{
              labels: Array.from({ length: sparkline.length }, (_, i) => i),
              datasets: [
                {
                  data: sparkline,
                  borderColor: iconTone === 'green' ? '#34D634' :
                             iconTone === 'blue' ? '#1143F3' :
                             iconTone === 'amber' ? '#f59e0b' :
                             iconTone === 'red' ? '#ef4444' : '#7c3aed',
                  backgroundColor: iconTone === 'green' ? 'rgba(52,214,52,0.08)' :
                                   iconTone === 'blue' ? 'rgba(17,67,243,0.08)' :
                                   iconTone === 'amber' ? 'rgba(245,158,11,0.08)' :
                                   iconTone === 'red' ? 'rgba(239,68,68,0.08)' : 'rgba(124,58,237,0.08)',
                  borderWidth: 2,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  tension: 0.4,
                  fill: true,
                },
              ],
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
      </div>
    </Card>
  );
}