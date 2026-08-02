from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CollectionPoint(Base):
    __tablename__ = "collection_points"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sector_id: Mapped[int] = mapped_column(ForeignKey("sectors.id"), nullable=False)
    road_node_id: Mapped[int | None] = mapped_column(ForeignKey("road_nodes.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    max_capacity_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    current_fill_level_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="active")
    priority_boost: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_emptied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sector: Mapped["Sector"] = relationship(back_populates="collection_points")
    waypoints: Mapped[list["RouteWaypoint"]] = relationship(back_populates="collection_point")
