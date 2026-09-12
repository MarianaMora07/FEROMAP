from datetime import datetime

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Parish(Base):
    __tablename__ = "parishes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    city: Mapped[str] = mapped_column(String(255), nullable=False, server_default="Ciudad Guayana")
    # Configuración por zona (F8): instalaciones y ventana horaria propias.
    # Nulas → se usa la configuración operativa global (backend/app/services/admin_service.py).
    depot_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    depot_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    landfill_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    landfill_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Ventana horaria de recolección de la zona, formato "HH:MM" dentro de la jornada.
    time_window_start: Mapped[str | None] = mapped_column(String(5), nullable=True)
    time_window_end: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    sectors: Mapped[list["Sector"]] = relationship(back_populates="parish")
