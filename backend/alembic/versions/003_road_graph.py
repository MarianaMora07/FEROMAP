"""Grafo vial: nodos, segmentos y enlace opcional en collection_points."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_road_graph"
down_revision: Union[str, None] = "002_routes_simulation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "road_nodes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("latitude", sa.Numeric(10, 8), nullable=False),
        sa.Column("longitude", sa.Numeric(11, 8), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "road_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_node_id", sa.Integer(), nullable=False),
        sa.Column("target_node_id", sa.Integer(), nullable=False),
        sa.Column("street_name", sa.String(length=255), nullable=False),
        sa.Column("distance_meters", sa.Numeric(10, 2), nullable=False),
        sa.Column("base_travel_time_seconds", sa.Integer(), nullable=False),
        sa.Column("traffic_multiplier", sa.Numeric(4, 2), server_default="1.0", nullable=False),
        sa.Column("is_blocked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_one_way", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["source_node_id"], ["road_nodes.id"]),
        sa.ForeignKeyConstraint(["target_node_id"], ["road_nodes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("collection_points", sa.Column("road_node_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_collection_points_road_node_id",
        "collection_points",
        "road_nodes",
        ["road_node_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_collection_points_road_node_id", "collection_points", type_="foreignkey")
    op.drop_column("collection_points", "road_node_id")
    op.drop_table("road_segments")
    op.drop_table("road_nodes")
