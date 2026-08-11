"""Notificaciones a conductores (mock / webhook)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db.models import DriverNotification, OptimizedRoute, Vehicle

logger = logging.getLogger(__name__)


def _serialize_notification(row: DriverNotification) -> dict[str, Any]:
    payload: dict[str, Any] = {}
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
        "payload": payload,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def _deliver_webhook(payload: dict[str, Any]) -> str:
    url = settings.driver_webhook_url
    if not url:
        logger.info("driver webhook mock: %s", json.dumps(payload, ensure_ascii=False))
        return "sent"
    try:
        response = httpx.post(url, json=payload, timeout=5.0)
        response.raise_for_status()
        return "sent"
    except Exception:
        logger.exception("driver webhook delivery failed")
        return "failed"


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
    status = _deliver_webhook(payload)
    row = DriverNotification(
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        channel="webhook_mock" if not settings.driver_webhook_url else "webhook",
        event_type=event_type,
        payload_json=json.dumps(payload, ensure_ascii=False),
        status=status,
    )
    db.add(row)
    db.flush()
    return _serialize_notification(row)


def notify_routes_dispatched(db: Session, route_ids: list[int], *, event_type: str = "route_dispatched") -> list[dict[str, Any]]:
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
