from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
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
    # Tasa total de generación de la zona (kg/día). Si está definida, se reparte
    # entre los contenedores activos según ``distribution_mode`` (ver sector_service).
    generation_rate_kg_per_day: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Población de la zona (hab.) y tasa per cápita (kg/hab/día). Si hay per cápita,
    # la tasa total de la zona se deriva como población × per_capita.
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    per_capita_kg_per_day: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    # equal | capacity | population.
    distribution_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="equal"
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
