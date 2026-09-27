from typing import Literal

from app.schemas.common import CamelModel

AlertLifecycleStatus = Literal["open", "acknowledged", "resolved"]


class AlertStatusUpdate(CamelModel):
    status: AlertLifecycleStatus


class AlertActivityOut(CamelModel):
    id: str
    alert_id: str
    time: str
    title: str
    detail: str
    status: str


class AlertsStatsOut(CamelModel):
    critical: int
    warning: int
    informational: int
    resolved_today: int
    total_active: int


class AlertsListResponse(CamelModel):
    alerts: list[dict]
    stats: AlertsStatsOut
