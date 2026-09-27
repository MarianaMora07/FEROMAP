"""Registro persistente de jobs de optimización/contingencia (Tarea 8)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_optimization_job_records"
down_revision: Union[str, None] = "021_collection_point_fill_hours"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "optimization_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("job_type", sa.String(length=50), nullable=False, server_default="simulation"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("phase", sa.String(length=50), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("params_json", sa.Text(), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("logs_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("optimization_jobs")
