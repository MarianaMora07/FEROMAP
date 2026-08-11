from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DriverNotification(Base):
    __tablename__ = "driver_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False, server_default="webhook_mock")
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="sent")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    driver: Mapped["Driver | None"] = relationship()
    vehicle: Mapped["Vehicle | None"] = relationship()
