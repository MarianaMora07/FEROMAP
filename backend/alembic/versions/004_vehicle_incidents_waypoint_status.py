"""Incidentes de vehículos y estado de paradas en ruta."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_incidents_waypoints"
down_revision: Union[str, None] = "003_road_graph"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "route_waypoints",
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
    )
    op.create_table(
        "vehicle_incidents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("route_id", sa.Integer(), nullable=True),
        sa.Column("incident_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("affects_active_route", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["route_id"], ["optimized_routes.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicle_incidents_vehicle_id", "vehicle_incidents", ["vehicle_id"])
    op.create_index("ix_vehicle_incidents_route_id", "vehicle_incidents", ["route_id"])
    op.create_index("ix_vehicle_incidents_reported_at", "vehicle_incidents", ["reported_at"])


def downgrade() -> None:
    op.drop_index("ix_vehicle_incidents_reported_at", table_name="vehicle_incidents")
    op.drop_index("ix_vehicle_incidents_route_id", table_name="vehicle_incidents")
    op.drop_index("ix_vehicle_incidents_vehicle_id", table_name="vehicle_incidents")
    op.drop_table("vehicle_incidents")
    op.drop_column("route_waypoints", "status")
