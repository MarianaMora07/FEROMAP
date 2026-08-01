from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SystemAlert(Base):
    __tablename__ = "system_alerts"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    source_key: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    source: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    location: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    category: Mapped[str] = mapped_column(String(50), nullable=False, server_default="sistema")
    longitude: Mapped[float] = mapped_column(Numeric(11, 8), nullable=False)
    latitude: Mapped[float] = mapped_column(Numeric(10, 8), nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="open")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    activities: Mapped[list["AlertActivity"]] = relationship(
        back_populates="alert",
        cascade="all, delete-orphan",
        order_by="AlertActivity.created_at.desc()",
    )


class AlertActivity(Base):
    __tablename__ = "alert_activities"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(ForeignKey("system_alerts.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    alert: Mapped[SystemAlert] = relationship(back_populates="activities")
