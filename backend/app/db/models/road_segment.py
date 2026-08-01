from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RoadSegment(Base):
    __tablename__ = "road_segments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_node_id: Mapped[int] = mapped_column(ForeignKey("road_nodes.id"), nullable=False)
    target_node_id: Mapped[int] = mapped_column(ForeignKey("road_nodes.id"), nullable=False)
    street_name: Mapped[str] = mapped_column(String(255), nullable=False)
    distance_meters: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    base_travel_time_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    traffic_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, server_default="1.0")
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_one_way: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    source_node: Mapped["RoadNode"] = relationship(back_populates="outgoing_segments", foreign_keys=[source_node_id])
    target_node: Mapped["RoadNode"] = relationship(back_populates="incoming_segments", foreign_keys=[target_node_id])
