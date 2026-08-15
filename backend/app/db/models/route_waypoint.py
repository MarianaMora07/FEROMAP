from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RouteWaypoint(Base):
    __tablename__ = "route_waypoints"
    __table_args__ = (UniqueConstraint("route_id", "collection_point_id", name="uq_route_waypoints_route_point"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("optimized_routes.id"), nullable=False)
    collection_point_id: Mapped[int | None] = mapped_column(ForeignKey("collection_points.id"), nullable=True)
    waypoint_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="collection")
    facility_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sequence_order: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    estimated_arrival_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_arrival_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    route: Mapped["OptimizedRoute"] = relationship(back_populates="waypoints")
    collection_point: Mapped["CollectionPoint"] = relationship(back_populates="waypoints")
