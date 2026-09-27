"""Fase 3 planificación: notificaciones a conductores."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_planning_phase3"
down_revision: Union[str, None] = "015_planning_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "driver_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id"), nullable=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id"), nullable=True),
        sa.Column("channel", sa.String(length=30), server_default="webhook_mock", nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="sent", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_driver_notifications_created_at", "driver_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_driver_notifications_created_at", table_name="driver_notifications")
    op.drop_table("driver_notifications")
