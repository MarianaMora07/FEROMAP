"""Override de velocidad de llenado por contenedor."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "028_collection_point_fill_rate_override"
down_revision: Union[str, None] = "027_sector_fill_rate_factor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "collection_points",
        sa.Column(
            "fill_rate_factor_override",
            sa.Numeric(4, 2),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("collection_points", "fill_rate_factor_override")
