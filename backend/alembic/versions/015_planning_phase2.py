"""Fase 2 planificación: escenario override por día."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_planning_phase2"
down_revision: Union[str, None] = "014_operational_planning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "weekly_plan_days",
        sa.Column("scenario_id_override", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("weekly_plan_days", "scenario_id_override")
