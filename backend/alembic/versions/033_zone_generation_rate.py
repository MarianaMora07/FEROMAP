"""Tasa de generación por zona y por contenedor (kg/día)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "033_zone_generation_rate"
down_revision: Union[str, None] = "032_statistical_validation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sectors",
        sa.Column("generation_rate_kg_per_day", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "collection_points",
        sa.Column("generation_rate_kg_per_day", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("collection_points", "generation_rate_kg_per_day")
    op.drop_column("sectors", "generation_rate_kg_per_day")
