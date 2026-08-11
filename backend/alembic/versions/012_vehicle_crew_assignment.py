"""Dotación por vehículo: ideal default 6 y assigned nullable."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_vehicle_crew_assignment"
down_revision: Union[str, None] = "011_admin_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "vehicles",
        "ideal_operators_count",
        server_default="6",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.add_column(
        "vehicles",
        sa.Column("assigned_operators_count", sa.Integer(), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE vehicles SET ideal_operators_count = 6 "
            "WHERE ideal_operators_count IS NULL OR ideal_operators_count < 6"
        )
    )
    # Demo: dotación incompleta en algunos camiones
    op.execute(
        sa.text(
            "UPDATE vehicles SET assigned_operators_count = 4 WHERE code IN ('TR-03', 'TR-06')"
        )
    )
    op.execute(
        sa.text(
            "UPDATE vehicles SET assigned_operators_count = 5 WHERE code IN ('TR-11', 'TR-02')"
        )
    )


def downgrade() -> None:
    op.drop_column("vehicles", "assigned_operators_count")
    op.alter_column(
        "vehicles",
        "ideal_operators_count",
        server_default="1",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
