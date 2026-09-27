"""Composición de flota semanal por tipo de vehículo (configuración base)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024_weekly_fleet_by_type"
down_revision: Union[str, None] = "023_weekly_preflight_json"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "weekly_plans",
        sa.Column("fleet_by_type_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("weekly_plans", "fleet_by_type_json")
