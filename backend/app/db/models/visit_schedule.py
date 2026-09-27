from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VisitSchedule(Base):
    __tablename__ = "visit_schedules"
    __table_args__ = (UniqueConstraint("collection_point_id", name="uq_visit_schedules_point"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    collection_point_id: Mapped[int] = mapped_column(ForeignKey("collection_points.id"), nullable=False)
    visits_per_week: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    weekdays_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_extra_visit: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    collection_point: Mapped["CollectionPoint"] = relationship()
