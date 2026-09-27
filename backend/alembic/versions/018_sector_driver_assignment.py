"""Agregar driver_id a sectors para asignación conductor-sector."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018_sector_driver_assignment"
down_revision: Union[str, None] = "017_landfill_waypoints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sectors",
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id"), nullable=True),
    )
    op.create_index("ix_sectors_driver_id", "sectors", ["driver_id"])


def downgrade() -> None:
    op.drop_index("ix_sectors_driver_id", table_name="sectors")
    op.drop_column("sectors", "driver_id")
