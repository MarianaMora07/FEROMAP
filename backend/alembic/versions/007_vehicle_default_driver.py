"""Conductor por defecto en vehículos."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_vehicle_default_driver"
down_revision: Union[str, None] = "006_priority_boost"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("default_driver_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_vehicles_default_driver_id_drivers",
        "vehicles",
        "drivers",
        ["default_driver_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_vehicles_default_driver_id_drivers", "vehicles", type_="foreignkey")
    op.drop_column("vehicles", "default_driver_id")
