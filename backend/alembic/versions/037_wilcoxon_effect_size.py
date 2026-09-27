"""Tamaño del efecto del contraste de Wilcoxon en validaciones estadísticas."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "037_wilcoxon_effect_size"
down_revision: Union[str, None] = "036_stop_confirmation_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "statistical_validations",
        sa.Column("effect_size_r", sa.Numeric(8, 4), nullable=True),
    )
    op.add_column(
        "statistical_validations",
        sa.Column("effect_size_dz", sa.Numeric(12, 4), nullable=True),
    )
    op.add_column(
        "statistical_validations",
        sa.Column("n_effective", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("statistical_validations", "n_effective")
    op.drop_column("statistical_validations", "effect_size_dz")
    op.drop_column("statistical_validations", "effect_size_r")
