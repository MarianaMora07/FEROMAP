"""Fase 9: waypoints de vertedero y paradas especiales."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017_landfill_waypoints"
down_revision: Union[str, None] = "016_planning_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "route_waypoints",
        sa.Column("waypoint_type", sa.String(length=20), server_default="collection", nullable=False),
    )
    op.add_column(
        "route_waypoints",
        sa.Column("facility_code", sa.String(length=30), nullable=True),
    )
    op.alter_column("route_waypoints", "collection_point_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("route_waypoints", "collection_point_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("route_waypoints", "facility_code")
    op.drop_column("route_waypoints", "waypoint_type")
