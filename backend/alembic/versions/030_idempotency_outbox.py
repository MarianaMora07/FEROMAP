"""Idempotencia, outbox de notificaciones y estado de entrega."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "030_idempotency_outbox"
down_revision: Union[str, None] = "029_session_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scope", sa.String(length=80), nullable=False),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="in_progress", nullable=False),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),
    )

    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("notification_id", sa.Integer(), nullable=True),
        sa.Column("channel", sa.String(length=30), server_default="webhook", nullable=False),
        sa.Column("target", sa.String(length=255), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["notification_id"], ["driver_notifications.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_outbox_status", "notification_outbox", ["status"])
    op.create_index("ix_notification_outbox_next_attempt", "notification_outbox", ["next_attempt_at"])
    op.create_index("ix_notification_outbox_notification", "notification_outbox", ["notification_id"])

    op.add_column(
        "driver_notifications",
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("driver_notifications", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column(
        "driver_notifications", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "driver_notifications", sa.Column("ack_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("driver_notifications", "ack_at")
    op.drop_column("driver_notifications", "sent_at")
    op.drop_column("driver_notifications", "last_error")
    op.drop_column("driver_notifications", "attempts")
    op.drop_index("ix_notification_outbox_notification", table_name="notification_outbox")
    op.drop_index("ix_notification_outbox_next_attempt", table_name="notification_outbox")
    op.drop_index("ix_notification_outbox_status", table_name="notification_outbox")
    op.drop_table("notification_outbox")
    op.drop_table("idempotency_records")
