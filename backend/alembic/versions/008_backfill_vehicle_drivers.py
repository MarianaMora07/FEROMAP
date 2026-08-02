"""Backfill default_driver_id desde data/seeds/vehicles.json."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.seed_loader import load_seed

revision: str = "008_backfill_vehicle_drivers"
down_revision: Union[str, None] = "007_vehicle_default_driver"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _split_driver_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def upgrade() -> None:
    connection = op.get_bind()
    try:
        vehicles_data = load_seed("vehicles.json")
    except FileNotFoundError:
        return

    for row in vehicles_data:
        driver_name = row.get("driverName")
        if not driver_name:
            continue
        first_name, last_name = _split_driver_name(driver_name)
        connection.execute(
            sa.text(
                """
                UPDATE vehicles AS v
                SET default_driver_id = d.id
                FROM drivers AS d
                WHERE v.code = :code
                  AND d.first_name = :first_name
                  AND d.last_name = :last_name
                  AND v.default_driver_id IS NULL
                """
            ),
            {"code": row["code"], "first_name": first_name, "last_name": last_name},
        )


def downgrade() -> None:
    op.execute(sa.text("UPDATE vehicles SET default_driver_id = NULL"))
