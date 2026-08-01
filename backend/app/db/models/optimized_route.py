from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OptimizedRoute(Base):
    __tablename__ = "optimized_routes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"), nullable=False)
    route_kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="optimized")
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    total_distance_meters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    estimated_duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="pending")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    vehicle: Mapped["Vehicle"] = relationship(back_populates="routes")
    driver: Mapped["Driver"] = relationship(back_populates="routes")
    waypoints: Mapped[list["RouteWaypoint"]] = relationship(back_populates="route", cascade="all, delete-orphan")
    incidents: Mapped[list["VehicleIncident"]] = relationship(back_populates="route")
