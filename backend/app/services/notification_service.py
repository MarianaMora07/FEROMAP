"""Notificaciones a conductores con outbox, reintentos y estado de entrega.

Canales soportados: ``webhook``, ``smtp``, ``whatsapp`` y ``webhook_mock``
(log local, cuando no hay integración configurada). Las entregas se encolan en
``notification_outbox``; si fallan se reintentan con backoff exponencial y el
estado queda trazable (``sent``/``failed``) sin duplicar la notificación.
"""

from __future__ import annotations

import json
import logging
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db.models import Driver, DriverNotification, NotificationOutbox, OptimizedRoute, Vehicle

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _configured_channels() -> list[str]:
    raw = settings.notification_channels
    if raw:
        return [channel.strip().lower() for channel in raw.split(",") if channel.strip()]
    if settings.driver_webhook_url:
        return ["webhook"]
    return ["webhook_mock"]


def _resolve_target(channel: str, driver: Driver | None, vehicle: Vehicle | None) -> str | None:
    if channel == "webhook":
        return settings.driver_webhook_url
    if channel == "whatsapp":
        return settings.whatsapp_webhook_url
    if channel == "smtp":
        user = getattr(driver, "user", None) if driver else None
        return getattr(user, "email", None)
    return None


def _send_email(target: str, payload: dict[str, Any]) -> None:
    message = EmailMessage()
    message["Subject"] = str(payload.get("eventType", "FEROMAP"))
    message["From"] = settings.smtp_from or settings.smtp_username or "no-reply@feromap.local"
    message["To"] = target
    message.set_content(str(payload.get("message", "")))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as server:
        if settings.smtp_use_tls:
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def _deliver(channel: str, target: str | None, payload: dict[str, Any]) -> None:
    """Entrega por canal. Lanza excepción si falla (dispara el reintento)."""
    if channel == "webhook_mock":
        logger.info(
            "notification_mock",
            extra={"event": "notification_mock", "channel": channel},
        )
        return
    if channel == "webhook":
        url = target or settings.driver_webhook_url
        if not url:
            raise RuntimeError("Canal webhook sin URL configurada")
        response = httpx.post(url, json=payload, timeout=5.0)
        response.raise_for_status()
        return
    if channel == "whatsapp":
        url = target or settings.whatsapp_webhook_url
        if not url:
            raise RuntimeError("Canal whatsapp sin webhook configurado")
        response = httpx.post(url, json=payload, timeout=5.0)
        response.raise_for_status()
        return
    if channel == "smtp":
        if not settings.smtp_host or not target:
            raise RuntimeError("Canal smtp sin host o destinatario")
        _send_email(target, payload)
        return
    raise RuntimeError(f"Canal desconocido: {channel}")


def _backoff_seconds(attempts: int) -> int:
    base = max(1, settings.notification_backoff_base_seconds)
    return min(base * (2 ** max(0, attempts - 1)), 3600)


def _serialize_notification(row: DriverNotification) -> dict[str, Any]:
    try:
        payload = json.loads(row.payload_json)
    except json.JSONDecodeError:
        payload = {"raw": row.payload_json}
    return {
        "id": row.id,
        "driverId": row.driver_id,
        "vehicleId": row.vehicle_id,
        "channel": row.channel,
        "eventType": row.event_type,
        "status": row.status,
        "attempts": row.attempts or 0,
        "lastError": row.last_error,
        "payload": payload,
        "sentAt": row.sent_at.isoformat() if row.sent_at else None,
        "ackAt": row.ack_at.isoformat() if row.ack_at else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def _sync_notification(db: Session, row: NotificationOutbox) -> None:
    if not row.notification_id:
        return
    notification = db.get(DriverNotification, row.notification_id)
    if notification is None:
        return
    notification.attempts = row.attempts
    notification.last_error = row.last_error
    if row.status == "sent":
        notification.status = "sent"
        notification.sent_at = row.sent_at
    elif row.status == "failed":
        notification.status = "failed"
    elif row.status == "acked":
        notification.status = "acked"
    else:
        notification.status = "queued"


def _attempt_delivery(db: Session, row: NotificationOutbox) -> str:
    """Intenta entregar una fila del outbox y actualiza estado/backoff."""
    now = _now()
    try:
        payload = json.loads(row.payload_json)
        _deliver(row.channel, row.target, payload)
    except Exception as exc:  # noqa: BLE001
        row.attempts = (row.attempts or 0) + 1
        row.last_error = str(exc)[:1000]
        if row.attempts >= max(1, row.max_attempts):
            row.status = "failed"
        else:
            row.status = "pending"
            row.next_attempt_at = now + timedelta(seconds=_backoff_seconds(row.attempts))
        _sync_notification(db, row)
        return row.status

    row.status = "sent"
    row.sent_at = now
    row.last_error = None
    _sync_notification(db, row)
    return "sent"


def notify_driver(
    db: Session,
    *,
    event_type: str,
    message: str,
    driver_id: int | None = None,
    vehicle_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {"message": message, "eventType": event_type, **(extra or {})}
    channel = _configured_channels()[0]
    driver = db.get(Driver, driver_id) if driver_id else None
    vehicle = db.get(Vehicle, vehicle_id) if vehicle_id else None
    target = _resolve_target(channel, driver, vehicle)

    notification = DriverNotification(
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        channel=channel,
        event_type=event_type,
        payload_json=json.dumps(payload, ensure_ascii=False),
        status="queued",
        attempts=0,
    )
    db.add(notification)
    db.flush()

    if not settings.notifications_outbox_enabled:
        # Modo legacy/rollback: entrega única best-effort, sin outbox ni reintentos.
        try:
            _deliver(channel, target, payload)
            notification.status = "sent"
            notification.sent_at = _now()
        except Exception as exc:  # noqa: BLE001
            notification.status = "failed"
            notification.last_error = str(exc)[:1000]
            notification.attempts = 1
        db.flush()
        return _serialize_notification(notification)

    outbox_row = NotificationOutbox(
        notification_id=notification.id,
        channel=channel,
        target=target,
        payload_json=json.dumps(payload, ensure_ascii=False),
        status="pending",
        attempts=0,
        max_attempts=max(1, settings.notification_max_attempts),
        next_attempt_at=_now(),
    )
    db.add(outbox_row)
    db.flush()
    _attempt_delivery(db, outbox_row)
    notification.attempts = outbox_row.attempts
    notification.last_error = outbox_row.last_error
    if outbox_row.status == "sent":
        notification.status = "sent"
        notification.sent_at = outbox_row.sent_at
    elif outbox_row.status == "failed":
        notification.status = "failed"
    else:
        notification.status = "queued"
    db.flush()
    return _serialize_notification(notification)


def process_due_outbox(
    db: Session,
    *,
    limit: int = 50,
    now: datetime | None = None,
) -> dict[str, int]:
    """Procesa las filas pendientes cuyo ``next_attempt_at`` ya venció."""
    reference = now or _now()
    rows = db.scalars(
        select(NotificationOutbox)
        .where(
            NotificationOutbox.status == "pending",
            NotificationOutbox.next_attempt_at <= reference,
        )
        .order_by(NotificationOutbox.next_attempt_at)
        .limit(limit)
    ).all()

    sent = retried = failed = 0
    for row in rows:
        outcome = _attempt_delivery(db, row)
        if outcome == "sent":
            sent += 1
        elif outcome == "failed":
            failed += 1
        else:
            retried += 1
    db.flush()
    return {"processed": len(rows), "sent": sent, "retried": retried, "failed": failed}


def ack_notification(db: Session, notification_id: int) -> dict[str, Any]:
    notification = db.get(DriverNotification, notification_id)
    if notification is None:
        raise LookupError("Notificación no encontrada")
    now = _now()
    notification.ack_at = now
    notification.status = "acked"
    row = db.scalar(
        select(NotificationOutbox)
        .where(NotificationOutbox.notification_id == notification_id)
        .order_by(NotificationOutbox.id.desc())
        .limit(1)
    )
    if row is not None:
        row.ack_at = now
        if row.status in {"sent", "pending"}:
            row.status = "acked"
    db.flush()
    return _serialize_notification(notification)


def notify_routes_dispatched(
    db: Session, route_ids: list[int], *, event_type: str = "route_dispatched"
) -> list[dict[str, Any]]:
    if not route_ids:
        return []
    routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.id.in_(route_ids))
        .options(joinedload(OptimizedRoute.vehicle))
    ).all()
    sent: list[dict[str, Any]] = []
    for route in routes:
        vehicle = route.vehicle or db.get(Vehicle, route.vehicle_id)
        driver_id = vehicle.default_driver_id if vehicle else None
        sent.append(
            notify_driver(
                db,
                event_type=event_type,
                message=f"Ruta #{route.id} asignada — revisa paradas pendientes",
                driver_id=driver_id,
                vehicle_id=vehicle.id if vehicle else None,
                extra={"routeId": route.id, "dailyPlanId": route.daily_plan_id},
            )
        )
    return sent


def list_recent_notifications(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(DriverNotification).order_by(DriverNotification.created_at.desc()).limit(limit)
    ).all()
    return [_serialize_notification(row) for row in rows]
