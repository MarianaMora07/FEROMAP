"""KPIs previsto/real del plan del día (Fase 0: contratos y datos)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "026_daily_plan_kpis"
down_revision: Union[str, None] = "025_weekly_operational_plan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "daily_plans",
        sa.Column("planned_kpis_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "daily_plans",
        sa.Column("actual_kpis_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_plans", "actual_kpis_json")
    op.drop_column("daily_plans", "planned_kpis_json")
