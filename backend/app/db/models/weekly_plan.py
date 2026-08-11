from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WeeklyPlan(Base):
    __tablename__ = "weekly_plans"
    __table_args__ = (UniqueConstraint("week_start_date", name="uq_weekly_plans_week_start"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    week_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="draft")
    scenario_id: Mapped[str] = mapped_column(String(50), nullable=False, server_default="normal")
    reference_simulation_id: Mapped[int | None] = mapped_column(ForeignKey("simulations.id"), nullable=True)
    expected_kpis_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    days: Mapped[list["WeeklyPlanDay"]] = relationship(back_populates="weekly_plan", cascade="all, delete-orphan")
    daily_plans: Mapped[list["DailyPlan"]] = relationship(back_populates="weekly_plan")


class WeeklyPlanDay(Base):
    __tablename__ = "weekly_plan_days"
    __table_args__ = (UniqueConstraint("weekly_plan_id", "operation_date", name="uq_weekly_plan_days_date"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    weekly_plan_id: Mapped[int] = mapped_column(ForeignKey("weekly_plans.id"), nullable=False)
    operation_date: Mapped[date] = mapped_column(Date, nullable=False)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    sector_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_point_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_vehicle_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scenario_id_override: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="planned")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    weekly_plan: Mapped["WeeklyPlan"] = relationship(back_populates="days")
