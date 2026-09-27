"""Casos de estudio aislados (Fase 12 — ADR-005)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019_case_studies"
down_revision: Union[str, None] = "018_sector_driver_assignment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "case_studies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_scenario_id", sa.String(length=50), server_default="normal", nullable=False),
        sa.Column("default_parameters_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_case_studies_code"),
    )
    op.create_index("ix_case_studies_status", "case_studies", ["status"])

    op.create_table(
        "case_study_points",
        sa.Column("case_study_id", sa.Integer(), nullable=False),
        sa.Column("collection_point_id", sa.Integer(), nullable=False),
        sa.Column("active_in_study", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("fill_level_kg_override", sa.Numeric(8, 2), nullable=True),
        sa.Column("demand_kg_override", sa.Numeric(8, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["case_study_id"], ["case_studies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["collection_point_id"], ["collection_points.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("case_study_id", "collection_point_id"),
    )
    op.create_index("ix_case_study_points_collection_point_id", "case_study_points", ["collection_point_id"])

    op.add_column("simulations", sa.Column("case_study_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_simulations_case_study_id",
        "simulations",
        "case_studies",
        ["case_study_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_simulations_case_study_id", "simulations", ["case_study_id"])


def downgrade() -> None:
    op.drop_index("ix_simulations_case_study_id", table_name="simulations")
    op.drop_constraint("fk_simulations_case_study_id", "simulations", type_="foreignkey")
    op.drop_column("simulations", "case_study_id")
    op.drop_index("ix_case_study_points_collection_point_id", table_name="case_study_points")
    op.drop_table("case_study_points")
    op.drop_index("ix_case_studies_status", table_name="case_studies")
    op.drop_table("case_studies")
