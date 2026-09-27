"""Configuración por zona: instalaciones y ventanas por parroquia (F8)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "031_parish_zone_config"
down_revision: Union[str, None] = "030_idempotency_outbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("parishes", sa.Column("depot_lat", sa.Float(), nullable=True))
    op.add_column("parishes", sa.Column("depot_lon", sa.Float(), nullable=True))
    op.add_column("parishes", sa.Column("landfill_lat", sa.Float(), nullable=True))
    op.add_column("parishes", sa.Column("landfill_lon", sa.Float(), nullable=True))
    op.add_column("parishes", sa.Column("time_window_start", sa.String(length=5), nullable=True))
    op.add_column("parishes", sa.Column("time_window_end", sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column("parishes", "time_window_end")
    op.drop_column("parishes", "time_window_start")
    op.drop_column("parishes", "landfill_lon")
    op.drop_column("parishes", "landfill_lat")
    op.drop_column("parishes", "depot_lon")
    op.drop_column("parishes", "depot_lat")
