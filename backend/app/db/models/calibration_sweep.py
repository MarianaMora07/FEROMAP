from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CalibrationSweep(Base):
    """Corrida completada de un barrido de calibración del motor (Fase 13).

    La BD es la **única fuente de verdad** de la evidencia de calibración: la lectura
    «vigente» de un barrido es su fila más reciente y el historial son las anteriores.

    Sigue el patrón de :class:`~app.db.models.statistical_validation.StatisticalValidation`:
    resumen en columnas tipadas (para reportes y consultas sin abrir el JSON) + el payload
    completo del contrato en ``payload_json``.
    """

    __tablename__ = "calibration_sweeps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    #: Barrido del motor: `sensitivity` · `objective` · `validation`.
    sweep: Mapped[str] = mapped_column(String(20), nullable=False)
    scenario_id: Mapped[str] = mapped_column(String(100), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    runs_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    runs_failed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: KPI primario (decisión D2): la menor distancia optimizada de la corrida, en km.
    best_distance_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    #: Sello de la instancia con la que se generó; informativo (ya no hay caché de fichero).
    instance_fingerprint: Mapped[str | None] = mapped_column(String(40), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # «Lo más reciente de este barrido»: la consulta que sirve la vista.
        Index("ix_calibration_sweeps_latest", "sweep", "created_at"),
    )
