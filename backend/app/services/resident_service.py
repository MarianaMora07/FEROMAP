from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, User, UserRole
from app.domain.criticality import is_at_risk_before_next_visit
from app.services.next_visit_service import next_visits_by_point
from app.services.geo_service import fill_level_pct
from app.services.resident_proximity_service import build_resident_proximity
from app.services.resident_schedule_service import build_resident_schedule


def resident_overview(db: Session, user: User) -> dict[str, Any]:
    if user.role != UserRole.residente:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo disponible para residentes",
        )
    if user.sector_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario no tiene sector asignado",
        )

    sector = user.sector
    sector_name = sector.name if sector else "—"

    points = db.scalars(
        select(CollectionPoint)
        .where(CollectionPoint.sector_id == user.sector_id)
        .order_by(CollectionPoint.code)
    ).all()

    collection_points = []
    for point in points:
        pct = fill_level_pct(point)
        collection_points.append(
            {
                "id": point.code,
                "address": point.code,
                "fillLevel": pct,
                "status": _fill_status(pct),
                "lastEmptiedAt": point.last_emptied_at.isoformat() if point.last_emptied_at else None,
                "lng": float(point.longitude),
                "lat": float(point.latitude),
            }
        )

    active_routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.status.in_(["in_progress", "pending"]))
        .options(
            joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
            joinedload(OptimizedRoute.vehicle),
        )
    ).unique().all()

    sector_routes = []
    for route in active_routes:
        sector_waypoints = [
            wp
            for wp in route.waypoints
            if wp.collection_point and wp.collection_point.sector_id == user.sector_id
        ]
        if not sector_waypoints:
            continue
        pending = [wp for wp in sector_waypoints if wp.status == "pending"]
        vehicle_code = route.vehicle.code if route.vehicle else f"R-{route.id}"
        sector_routes.append(
            {
                "routeId": route.id,
                "vehicle": vehicle_code,
                "status": route.status,
                "stopsInSector": len(sector_waypoints),
                "pendingStops": len(pending),
                "nextStop": pending[0].collection_point.code if pending else None,
            }
        )

    schedule = build_resident_schedule(db, sector_id=user.sector_id)

    visits = next_visits_by_point(db)

    at_risk_points = 0
    for point in points:
        pct = fill_level_pct(point)
        if getattr(point, "status", "active") != "active" or pct >= 80:
            continue
        point_id = getattr(point, "id", None)
        visit = visits.get(point_id) if point_id is not None else None
        if visit is not None and is_at_risk_before_next_visit(point, next_visit_hours=visit.hours):
            at_risk_points += 1

    alerts = []
    if schedule.get("hasSchedule"):
        alerts.append(
            {
                "title": "Horario de recolección",
                "detail": (
                    f"Tu sector ({sector_name}) tiene recolección: "
                    f"{schedule['collectionDays']} · {schedule['window']}."
                ),
            }
        )
    else:
        alerts.append(
            {
                "title": "Sin recolección programada",
                "detail": f"Tu sector ({sector_name}) no tiene visitas en el plan semanal aprobado.",
            }
        )

    return {
        "sectorName": sector_name,
        "schedule": schedule,
        "proximity": build_resident_proximity(db, user),
        "collectionPoints": collection_points,
        "activeRoutesInSector": sector_routes,
        "alerts": alerts,
        "stats": {
            "totalPoints": len(collection_points),
            "criticalPoints": sum(1 for p in collection_points if p["fillLevel"] >= 80),
            "atRiskPoints": at_risk_points,
            "routesServingSector": len(sector_routes),
        },
    }


def _fill_status(pct: int) -> str:
    if pct >= 80:
        return "critico"
    if pct >= 60:
        return "lleno"
    if pct >= 30:
        return "parcial"
    return "normal"
