"""Tablas de alertas del sistema y actividad."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_system_alerts"
down_revision: Union[str, None] = "008_backfill_vehicle_drivers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "system_alerts",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("source_key", sa.String(length=100), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("detail", sa.Text(), server_default="", nullable=False),
        sa.Column("source", sa.String(length=255), server_default="", nullable=False),
        sa.Column("location", sa.String(length=255), server_default="", nullable=False),
        sa.Column("category", sa.String(length=50), server_default="sistema", nullable=False),
        sa.Column("longitude", sa.Numeric(11, 8), nullable=False),
        sa.Column("latitude", sa.Numeric(10, 8), nullable=False),
        sa.Column("lifecycle_status", sa.String(length=20), server_default="open", nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_key"),
    )
    op.create_table(
        "alert_activities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("alert_id", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["alert_id"], ["system_alerts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("alert_activities")
    op.drop_table("system_alerts")
