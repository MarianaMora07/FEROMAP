"""Evidencia de calibración del motor en la base de datos (Fase 13).

Sustituye la caché en fichero (`data/cache/phase3/aco_sensitivity.json`,
`data/cache/phase13/*.json`): mantener dos fuentes de verdad hacía que los números
sobrevivieran a un reset de BD y no se supiera de qué instancia eran.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035_calibration_sweeps"
down_revision: Union[str, None] = "034_generation_calibration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calibration_sweeps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sweep", sa.String(length=20), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Numeric(10, 2), nullable=True),
        sa.Column("runs_total", sa.Integer(), nullable=True),
        sa.Column("runs_failed", sa.Integer(), nullable=True),
        sa.Column("best_distance_km", sa.Numeric(10, 2), nullable=True),
        sa.Column("instance_fingerprint", sa.String(length=40), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_calibration_sweeps_latest", "calibration_sweeps", ["sweep", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_calibration_sweeps_latest", table_name="calibration_sweeps")
    op.drop_table("calibration_sweeps")
