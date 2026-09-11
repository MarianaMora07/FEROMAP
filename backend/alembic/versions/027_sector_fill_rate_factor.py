"""Factor de velocidad de llenado por zona (sector)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "027_sector_fill_rate_factor"
down_revision: Union[str, None] = "026_daily_plan_kpis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sectors",
        sa.Column(
            "fill_rate_factor",
            sa.Numeric(4, 2),
            nullable=False,
            server_default="1.00",
        ),
    )


def downgrade() -> None:
    op.drop_column("sectors", "fill_rate_factor")
