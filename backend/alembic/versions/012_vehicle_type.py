"""Tipo de vehículo: Volteo o Compactadora."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_vehicle_type"
down_revision: Union[str, None] = "011_admin_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("vehicle_type", sa.String(50), nullable=False, server_default="Compactadora"),
    )


def downgrade() -> None:
    op.drop_column("vehicles", "vehicle_type")
