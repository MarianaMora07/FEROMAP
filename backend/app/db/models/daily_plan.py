from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DailyPlan(Base):
    __tablename__ = "daily_plans"
    __table_args__ = (UniqueConstraint("operation_date", name="uq_daily_plans_operation_date"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    operation_date: Mapped[date] = mapped_column(Date, nullable=False)
    weekly_plan_id: Mapped[int | None] = mapped_column(ForeignKey("weekly_plans.id"), nullable=True)
    weekly_plan_day_id: Mapped[int | None] = mapped_column(ForeignKey("weekly_plan_days.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="draft")
    scenario_id: Mapped[str] = mapped_column(String(50), nullable=False, server_default="normal")
    simulation_id: Mapped[int | None] = mapped_column(ForeignKey("simulations.id"), nullable=True)
    scheduled_point_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_point_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_point_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    weekly_plan: Mapped["WeeklyPlan | None"] = relationship(back_populates="daily_plans")
    routes: Mapped[list["OptimizedRoute"]] = relationship(back_populates="daily_plan")
