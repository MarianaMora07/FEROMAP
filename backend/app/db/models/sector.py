from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sector(Base):
    __tablename__ = "sectors"
    __table_args__ = (UniqueConstraint("parish_id", "name", name="uq_sectors_parish_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    parish_id: Mapped[int] = mapped_column(ForeignKey("parishes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Velocidad de llenado de la zona: > 1 = se llena más rápido (zona poblada).
    fill_rate_factor: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default="1.00"
    )
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True, index=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    parish: Mapped["Parish"] = relationship(back_populates="sectors")
    collection_points: Mapped[list["CollectionPoint"]] = relationship(back_populates="sector")
    users: Mapped[list["User"]] = relationship(back_populates="sector")
    driver: Mapped["Driver | None"] = relationship(back_populates="sectors")
