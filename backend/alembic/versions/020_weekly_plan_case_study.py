"""Puente planificación semanal ↔ casos de estudio (Fase 12.6)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_weekly_plan_case_study"
down_revision: Union[str, None] = "019_case_studies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("weekly_plans", sa.Column("case_study_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_weekly_plans_case_study_id",
        "weekly_plans",
        "case_studies",
        ["case_study_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_weekly_plans_case_study_id", "weekly_plans", ["case_study_id"])

    op.add_column("weekly_plan_days", sa.Column("case_study_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_weekly_plan_days_case_study_id",
        "weekly_plan_days",
        "case_studies",
        ["case_study_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_weekly_plan_days_case_study_id", "weekly_plan_days", ["case_study_id"])


def downgrade() -> None:
    op.drop_index("ix_weekly_plan_days_case_study_id", table_name="weekly_plan_days")
    op.drop_constraint("fk_weekly_plan_days_case_study_id", "weekly_plan_days", type_="foreignkey")
    op.drop_column("weekly_plan_days", "case_study_id")

    op.drop_index("ix_weekly_plans_case_study_id", table_name="weekly_plans")
    op.drop_constraint("fk_weekly_plans_case_study_id", "weekly_plans", type_="foreignkey")
    op.drop_column("weekly_plans", "case_study_id")
