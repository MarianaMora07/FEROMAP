from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AlertActivity, SystemAlert
from app.services.operations_service import alerts_from_db
from app.services.seed_loader import load_seed

LIFECYCLE_TO_UI: dict[str, str] = {
    "open": "nueva",
    "acknowledged": "en-progreso",
    "resolved": "resuelta",
}

UI_TO_LIFECYCLE: dict[str, str] = {
    "nueva": "open",
    "en-progreso": "acknowledged",
    "informativa": "acknowledged",
    "resuelta": "resolved",
}


def _parse_alert_datetime(value: str) -> datetime:
    for fmt in ("%d/%m/%Y %I:%M %p", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


def _format_alert_datetime(value: datetime | None) -> str:
    if value is None:
        return "—"
    return value.astimezone(timezone.utc).strftime("%d/%m/%Y %I:%M %p")


def serialize_alert(alert: SystemAlert) -> dict[str, Any]:
    ui_status = LIFECYCLE_TO_UI.get(alert.lifecycle_status, alert.lifecycle_status)
    if alert.priority == "informativa" and alert.lifecycle_status == "open":
        ui_status = "informativa"
    return {
        "id": alert.id,
        "priority": alert.priority,
        "title": alert.title,
        "detail": alert.detail,
        "source": alert.source,
        "location": alert.location,
        "datetime": _format_alert_datetime(alert.occurred_at),
        "status": ui_status,
        "category": alert.category,
        "lng": float(alert.longitude),
        "lat": float(alert.latitude),
        "lifecycleStatus": alert.lifecycle_status,
    }


def _log_activity(db: Session, alert: SystemAlert, action: str, message: str) -> None:
    db.add(
        AlertActivity(
            alert_id=alert.id,
            action=action,
            message=message,
        )
    )


def sync_dynamic_alerts(db: Session) -> None:
    for payload in alerts_from_db(db):
        source_key = payload["id"]
        existing = db.scalar(select(SystemAlert).where(SystemAlert.source_key == source_key))
        if existing is not None:
            if existing.lifecycle_status == "resolved":
                continue
            existing.priority = payload["priority"]
            existing.title = payload["title"]
            existing.detail = payload["detail"]
            existing.source = payload["source"]
            existing.location = payload["location"]
            existing.longitude = payload["lng"]
            existing.latitude = payload["lat"]
            existing.category = payload["category"]
            continue

        db.add(
            SystemAlert(
                id=source_key,
                source_key=source_key,
                priority=payload["priority"],
                title=payload["title"],
                detail=payload["detail"],
                source=payload["source"],
                location=payload["location"],
                category=payload["category"],
                longitude=payload["lng"],
                latitude=payload["lat"],
                lifecycle_status="open",
                occurred_at=datetime.now(timezone.utc),
            )
        )
    db.flush()


def _compute_stats(db: Session) -> dict[str, int]:
    active = db.scalars(
        select(SystemAlert).where(SystemAlert.lifecycle_status != "resolved")
    ).all()
    return _stats_from_alerts(db, active)


def _stats_from_alerts(db: Session, alerts: list[SystemAlert]) -> dict[str, int]:
    active = [alert for alert in alerts if alert.lifecycle_status != "resolved"]
    today = datetime.now(timezone.utc).date()
    resolved_today = db.scalar(
        select(func.count())
        .select_from(SystemAlert)
        .where(
            SystemAlert.lifecycle_status == "resolved",
            func.date(SystemAlert.resolved_at) == today,
        )
    )
    return {
        "critical": sum(1 for alert in active if alert.priority == "critica"),
        "warning": sum(1 for alert in active if alert.priority == "advertencia"),
        "informational": sum(1 for alert in active if alert.priority == "informativa"),
        "resolvedToday": int(resolved_today or 0),
        "totalActive": len(active),
    }


def _contains_token(text: str, needle: str) -> bool:
    """Coincidencia por límite de palabra (evita que 'Unare I' matchee 'Unare II')."""
    token = needle.strip().lower()
    if not token:
        return True
    return re.search(rf"(?<![0-9a-z]){re.escape(token)}(?![0-9a-z])", text) is not None


def alert_matches_scope(
    alert: SystemAlert,
    *,
    sector: str | None = None,
    vehicle: str | None = None,
) -> bool:
    """Scoping de alertas por sector y/o vehículo (F6).

    El modelo de ``SystemAlert`` no tiene FK a sector/vehículo, así que se compara
    contra ``location`` (sector/dirección) y ``source`` (p. ej. "Vehículo TR-06").
    """
    location = (alert.location or "").lower()
    source = (alert.source or "").lower()
    if sector and not _contains_token(location, sector):
        return False
    if vehicle and not (_contains_token(source, vehicle) or _contains_token(location, vehicle)):
        return False
    return True


def list_alerts_payload(
    db: Session,
    *,
    active_only: bool = True,
    sync: bool = True,
    sector: str | None = None,
    vehicle: str | None = None,
) -> dict[str, Any]:
    # "sync" crea alertas derivadas del estado actual (contenedores críticos, etc.).
    # El dashboard lo desactiva para no inventar actividad en una BD recién sembrada.
    if sync:
        sync_dynamic_alerts(db)
    stmt = select(SystemAlert).order_by(SystemAlert.occurred_at.desc())
    if active_only:
        stmt = stmt.where(SystemAlert.lifecycle_status != "resolved")
    alerts = list(db.scalars(stmt).all())
    if sector or vehicle:
        alerts = [
            alert
            for alert in alerts
            if alert_matches_scope(alert, sector=sector, vehicle=vehicle)
        ]
    return {
        "alerts": [serialize_alert(alert) for alert in alerts],
        "stats": _stats_from_alerts(db, alerts),
    }


def list_alerts(db: Session, *, active_only: bool = True, sync: bool = True) -> list[dict[str, Any]]:
    return list_alerts_payload(db, active_only=active_only, sync=sync)["alerts"]


def list_alert_activity(db: Session, *, limit: int = 8, sync: bool = True) -> list[dict[str, Any]]:
    if sync:
        sync_dynamic_alerts(db)
    rows = db.scalars(
        select(AlertActivity)
        .join(SystemAlert)
        .order_by(AlertActivity.created_at.desc())
        .limit(limit)
    ).all()

    if rows:
        return [_serialize_activity(row) for row in rows]

    alerts = db.scalars(
        select(SystemAlert).order_by(SystemAlert.updated_at.desc()).limit(limit)
    ).all()
    return [
        {
            "id": f"seed-{alert.id}",
            "alertId": alert.id,
            "time": _format_alert_datetime(alert.occurred_at).split(" ", 1)[-1],
            "title": alert.title,
            "detail": f"{alert.source} · {alert.detail}",
            "status": serialize_alert(alert)["status"],
        }
        for alert in alerts
    ]


def _serialize_activity(activity: AlertActivity) -> dict[str, Any]:
    alert = activity.alert
    ui_status = serialize_alert(alert)["status"] if alert is not None else "nueva"
    created = activity.created_at or datetime.now(timezone.utc)
    return {
        "id": str(activity.id),
        "alertId": activity.alert_id,
        "time": created.astimezone(timezone.utc).strftime("%I:%M %p"),
        "title": alert.title if alert is not None else activity.message,
        "detail": activity.message,
        "status": ui_status,
    }


def update_alert_status(db: Session, alert_id: str, lifecycle_status: str) -> dict[str, Any]:
    if lifecycle_status not in {"open", "acknowledged", "resolved"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Estado inválido")

    alert = db.get(SystemAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    now = datetime.now(timezone.utc)
    previous = alert.lifecycle_status
    alert.lifecycle_status = lifecycle_status
    if lifecycle_status == "acknowledged" and alert.acknowledged_at is None:
        alert.acknowledged_at = now
    if lifecycle_status == "resolved":
        alert.resolved_at = now

    action_labels = {
        "open": "reabierta",
        "acknowledged": "marcada como vista",
        "resolved": "resuelta",
    }
    if previous != lifecycle_status:
        _log_activity(
            db,
            alert,
            lifecycle_status,
            f"Alerta {action_labels.get(lifecycle_status, lifecycle_status)}",
        )

    db.commit()
    db.refresh(alert)
    return serialize_alert(alert)


def seed_alerts_from_json(db: Session) -> int:
    rows = load_seed("alerts.json")
    count = 0
    for row in rows:
        alert_id = row["id"]
        if db.get(SystemAlert, alert_id) is not None:
            continue
        lifecycle = UI_TO_LIFECYCLE.get(row.get("status", "nueva"), "open")
        occurred_at = _parse_alert_datetime(row.get("datetime", ""))
        acknowledged_at = occurred_at if lifecycle == "acknowledged" else None
        resolved_at = occurred_at if lifecycle == "resolved" else None
        db.add(
            SystemAlert(
                id=alert_id,
                source_key=None,
                priority=row["priority"],
                title=row["title"],
                detail=row.get("detail", ""),
                source=row.get("source", ""),
                location=row.get("location", ""),
                category=row.get("category", "sistema"),
                longitude=row["lng"],
                latitude=row["lat"],
                lifecycle_status=lifecycle,
                occurred_at=occurred_at,
                acknowledged_at=acknowledged_at,
                resolved_at=resolved_at,
            )
        )
        count += 1
    db.flush()
    return count
