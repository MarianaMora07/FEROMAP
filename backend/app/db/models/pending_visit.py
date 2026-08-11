from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PendingVisit(Base):
    __tablename__ = "pending_visits"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    collection_point_id: Mapped[int] = mapped_column(ForeignKey("collection_points.id"), nullable=False)
    origin_operation_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_operation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str] = mapped_column(String(50), nullable=False, server_default="not_visited")
    source_waypoint_id: Mapped[int | None] = mapped_column(ForeignKey("route_waypoints.id"), nullable=True)
    source_incident_id: Mapped[int | None] = mapped_column(ForeignKey("vehicle_incidents.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="open")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    collection_point: Mapped["CollectionPoint"] = relationship()
