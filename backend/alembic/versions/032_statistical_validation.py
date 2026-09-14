"""Validación estadística: tabla de resultados de pruebas de Wilcoxon."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "032_statistical_validation"
down_revision: Union[str, None] = "031_parish_zone_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "statistical_validations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scenario_id", sa.String(length=100), nullable=False),
        sa.Column("n_runs", sa.Integer(), nullable=False),
        sa.Column("mean_distance_current", sa.Numeric(10, 2), nullable=False),
        sa.Column("mean_distance_optimized", sa.Numeric(10, 2), nullable=False),
        sa.Column("saving_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("std_distance_optimized", sa.Numeric(10, 2), nullable=False),
        sa.Column("wilcoxon_statistic", sa.Numeric(10, 4), nullable=True),
        sa.Column("wilcoxon_p_value", sa.Numeric(12, 8), nullable=True),
        sa.Column("confidence_interval_lower", sa.Numeric(10, 2), nullable=True),
        sa.Column("confidence_interval_upper", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_significant", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("runs_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("statistical_validations")
