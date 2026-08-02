"""Prioridad reforzada en puntos de recolección."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_priority_boost"
down_revision: Union[str, None] = "005_users_fleet"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "collection_points",
        sa.Column("priority_boost", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("collection_points", "priority_boost")
