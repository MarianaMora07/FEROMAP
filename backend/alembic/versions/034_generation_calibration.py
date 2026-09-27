"""Reparto proporcional, modelo per cápita y calibración de la generación."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "034_generation_calibration"
down_revision: Union[str, None] = "033_zone_generation_rate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Zona: población (para el modelo per cápita) y cómo repartir su tasa.
    op.add_column("sectors", sa.Column("population", sa.Integer(), nullable=True))
    op.add_column("sectors", sa.Column("per_capita_kg_per_day", sa.Numeric(6, 3), nullable=True))
    op.add_column(
        "sectors",
        sa.Column(
            "distribution_mode",
            sa.String(length=20),
            nullable=False,
            server_default="equal",
        ),
    )

    # Contenedor: población servida (reparto por población) y metadatos de calibración.
    op.add_column("collection_points", sa.Column("served_population", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "collection_points",
        sa.Column("last_calibrated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("collection_points", sa.Column("calibration_samples", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("collection_points", "calibration_samples")
    op.drop_column("collection_points", "last_calibrated_at")
    op.drop_column("collection_points", "served_population")
    op.drop_column("sectors", "distribution_mode")
    op.drop_column("sectors", "per_capita_kg_per_day")
    op.drop_column("sectors", "population")
