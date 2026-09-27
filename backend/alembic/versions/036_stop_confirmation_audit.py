"""F5b: auditoría de confirmación de parada por el conductor (ADR-007)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "036_stop_confirmation_audit"
down_revision: Union[str, None] = "035_calibration_sweeps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "route_waypoints",
        sa.Column("confirmed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "route_waypoints",
        sa.Column("confirmation_source", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("route_waypoints", "confirmation_source")
    op.drop_column("route_waypoints", "confirmed_by_user_id")
