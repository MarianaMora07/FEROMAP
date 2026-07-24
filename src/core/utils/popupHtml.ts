import type { ContainerFeature } from '../../data/types/geo';
import { fillLevelColor, fillLevelLabel, formatDate } from './geoUtils';

export function buildContainerPopupHtml(container: ContainerFeature): string {
  const p = container.properties;
  const color = fillLevelColor(p.fillLevel);
  const critical = p.fillLevel >= 80
    ? '<p style="margin:8px 0 0;padding:6px 8px;background:#fef2f2;color:#b91c1c;border-radius:6px;font-size:11px;font-weight:600;">Requiere recolección prioritaria</p>'
    : '';

  return `
    <div style="min-width:200px;font-family:system-ui,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:14px;">${p.id}</strong>
        <span style="font-size:11px;text-transform:capitalize;background:#f1f5f9;padding:2px 8px;border-radius:999px;">${p.priority}</span>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#475569;">Sector: <strong>${p.sector}</strong></p>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
          <span>Llenado</span>
          <span style="color:${color};font-weight:600;">${fillLevelLabel(p.fillLevel)} (${p.fillLevel}%)</span>
        </div>
        <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${p.fillLevel}%;background:${color};border-radius:999px;"></div>
        </div>
      </div>
      <p style="margin:0;font-size:11px;color:#64748b;">Última recolección: ${formatDate(p.lastCollection)}</p>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b;">Capacidad: ${p.capacityKg} kg</p>
      ${critical}
    </div>
  `;
}
