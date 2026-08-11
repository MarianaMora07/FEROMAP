"""Planificación operativa: planes semanales, diarios y pendientes."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_operational_planning"
down_revision: Union[str, None] = "013_vehicle_crew_assignment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "weekly_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("week_end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="draft", nullable=False),
        sa.Column("scenario_id", sa.String(length=50), server_default="normal", nullable=False),
        sa.Column("reference_simulation_id", sa.Integer(), nullable=True),
        sa.Column("expected_kpis_json", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reference_simulation_id"], ["simulations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("week_start_date", name="uq_weekly_plans_week_start"),
    )
    op.create_table(
        "weekly_plan_days",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("weekly_plan_id", sa.Integer(), nullable=False),
        sa.Column("operation_date", sa.Date(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("sector_ids_json", sa.Text(), nullable=True),
        sa.Column("collection_point_ids_json", sa.Text(), nullable=True),
        sa.Column("expected_vehicle_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="planned", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["weekly_plan_id"], ["weekly_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("weekly_plan_id", "operation_date", name="uq_weekly_plan_days_date"),
    )
    op.create_table(
        "visit_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("collection_point_id", sa.Integer(), nullable=False),
        sa.Column("visits_per_week", sa.Integer(), server_default="1", nullable=False),
        sa.Column("weekdays_json", sa.Text(), nullable=True),
        sa.Column("is_extra_visit", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_until", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["collection_point_id"], ["collection_points.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("collection_point_id", name="uq_visit_schedules_point"),
    )
    op.create_table(
        "daily_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("operation_date", sa.Date(), nullable=False),
        sa.Column("weekly_plan_id", sa.Integer(), nullable=True),
        sa.Column("weekly_plan_day_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="draft", nullable=False),
        sa.Column("scenario_id", sa.String(length=50), server_default="normal", nullable=False),
        sa.Column("simulation_id", sa.Integer(), nullable=True),
        sa.Column("scheduled_point_ids_json", sa.Text(), nullable=True),
        sa.Column("pending_point_ids_json", sa.Text(), nullable=True),
        sa.Column("final_point_ids_json", sa.Text(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"]),
        sa.ForeignKeyConstraint(["weekly_plan_day_id"], ["weekly_plan_days.id"]),
        sa.ForeignKeyConstraint(["weekly_plan_id"], ["weekly_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_date", name="uq_daily_plans_operation_date"),
    )
    op.create_table(
        "pending_visits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("collection_point_id", sa.Integer(), nullable=False),
        sa.Column("origin_operation_date", sa.Date(), nullable=False),
        sa.Column("target_operation_date", sa.Date(), nullable=True),
        sa.Column("reason", sa.String(length=50), server_default="not_visited", nullable=False),
        sa.Column("source_waypoint_id", sa.Integer(), nullable=True),
        sa.Column("source_incident_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="open", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["collection_point_id"], ["collection_points.id"]),
        sa.ForeignKeyConstraint(["source_incident_id"], ["vehicle_incidents.id"]),
        sa.ForeignKeyConstraint(["source_waypoint_id"], ["route_waypoints.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pending_visits_status_target", "pending_visits", ["status", "target_operation_date"])
    op.create_table(
        "plan_versions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("optimized_routes", sa.Column("daily_plan_id", sa.Integer(), nullable=True))
    op.add_column("optimized_routes", sa.Column("simulation_id", sa.Integer(), nullable=True))
    op.add_column("optimized_routes", sa.Column("planning_level", sa.String(length=30), nullable=True))
    op.create_foreign_key(
        "fk_optimized_routes_daily_plan_id",
        "optimized_routes",
        "daily_plans",
        ["daily_plan_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_optimized_routes_simulation_id",
        "optimized_routes",
        "simulations",
        ["simulation_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_optimized_routes_simulation_id", "optimized_routes", type_="foreignkey")
    op.drop_constraint("fk_optimized_routes_daily_plan_id", "optimized_routes", type_="foreignkey")
    op.drop_column("optimized_routes", "planning_level")
    op.drop_column("optimized_routes", "simulation_id")
    op.drop_column("optimized_routes", "daily_plan_id")
    op.drop_table("plan_versions")
    op.drop_index("ix_pending_visits_status_target", table_name="pending_visits")
    op.drop_table("pending_visits")
    op.drop_table("daily_plans")
    op.drop_table("visit_schedules")
    op.drop_table("weekly_plan_days")
    op.drop_table("weekly_plans")
