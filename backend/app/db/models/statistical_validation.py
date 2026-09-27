from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StatisticalValidation(Base):
    __tablename__ = "statistical_validations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[str] = mapped_column(String(100), nullable=False)
    n_runs: Mapped[int] = mapped_column(Integer, nullable=False)
    mean_distance_current: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    mean_distance_optimized: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    saving_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    std_distance_optimized: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    wilcoxon_statistic: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    wilcoxon_p_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    effect_size_r: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    effect_size_dz: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    n_effective: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence_interval_lower: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    confidence_interval_upper: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_significant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    runs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
