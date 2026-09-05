"""Modelo de generación temporal de residuos: horas estimadas de llenado (Tarea 3)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_collection_point_fill_hours"
down_revision: Union[str, None] = "020_weekly_plan_case_study"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "collection_points",
        sa.Column(
            "estimated_fill_hours",
            sa.Numeric(6, 1),
            nullable=False,
            server_default="72",
        ),
    )


def downgrade() -> None:
    op.drop_column("collection_points", "estimated_fill_hours")
