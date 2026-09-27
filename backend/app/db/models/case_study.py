from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CaseStudy(Base):
    __tablename__ = "case_studies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_scenario_id: Mapped[str] = mapped_column(String(50), nullable=False, server_default="normal")
    default_parameters_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    point_memberships: Mapped[list["CaseStudyPoint"]] = relationship(
        back_populates="case_study",
        cascade="all, delete-orphan",
    )
    simulations: Mapped[list["Simulation"]] = relationship(back_populates="case_study")


class CaseStudyPoint(Base):
    __tablename__ = "case_study_points"

    case_study_id: Mapped[int] = mapped_column(
        ForeignKey("case_studies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    collection_point_id: Mapped[int] = mapped_column(
        ForeignKey("collection_points.id", ondelete="CASCADE"),
        primary_key=True,
    )
    active_in_study: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    fill_level_kg_override: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    demand_kg_override: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    case_study: Mapped["CaseStudy"] = relationship(back_populates="point_memberships")
    collection_point: Mapped["CollectionPoint"] = relationship(back_populates="case_study_memberships")
