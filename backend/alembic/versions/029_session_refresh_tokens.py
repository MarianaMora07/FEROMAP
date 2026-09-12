"""Refresh tokens rotativos en user_sessions."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029_session_refresh_tokens"
down_revision: Union[str, None] = "028_cp_fill_rate_override"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "refresh_expires_at")
    op.drop_column("user_sessions", "refresh_token_hash")
