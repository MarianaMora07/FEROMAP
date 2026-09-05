"""Pre-flight de factibilidad semanal por día (Tarea 9)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_weekly_preflight_json"
down_revision: Union[str, None] = "022_optimization_job_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "weekly_plans",
        sa.Column("preflight_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("weekly_plans", "preflight_json")
