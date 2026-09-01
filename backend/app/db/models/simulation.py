from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    scenario_name: Mapped[str] = mapped_column(String(255), nullable=False)
    parameters_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    kpi_total_distance_historical: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    kpi_total_distance_optimized: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    kpi_saving_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    case_study_id: Mapped[int | None] = mapped_column(ForeignKey("case_studies.id"), nullable=True, index=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case_study: Mapped["CaseStudy | None"] = relationship(back_populates="simulations")
