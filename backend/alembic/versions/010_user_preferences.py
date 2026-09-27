"""Preferencias de usuario, avatar y sesiones."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_user_preferences"
down_revision: Union[str, None] = "009_system_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(length=512), nullable=True))
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("theme", sa.String(length=20), server_default="light", nullable=False),
        sa.Column("language", sa.String(length=10), server_default="es", nullable=False),
        sa.Column("units", sa.String(length=20), server_default="metric", nullable=False),
        sa.Column("default_view", sa.String(length=30), server_default="dashboard", nullable=False),
        sa.Column("report_frequency", sa.String(length=20), server_default="daily", nullable=False),
        sa.Column("page_size", sa.Integer(), server_default="20", nullable=False),
        sa.Column("email_notifications", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("system_notifications", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(length=80), server_default="America/Caracas", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("device_label", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("user_preferences")
    op.drop_column("users", "avatar_url")
