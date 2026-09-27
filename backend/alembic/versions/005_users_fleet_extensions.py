"""Usuarios/roles, operadores ideales por vehículo y vínculo conductor-usuario."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.security import hash_password

revision: str = "005_users_fleet"
down_revision: Union[str, None] = "004_incidents_waypoints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_ROLE = postgresql.ENUM(
    "administrador",
    "planificador",
    "conductor",
    "residente",
    name="user_role",
    create_type=False,
)

DEMO_PASSWORD_HASH = hash_password("123456789")


def _backfill_driver_users(connection: sa.Connection) -> None:
    drivers = connection.execute(
        sa.text(
            """
            SELECT id, document, first_name, last_name, phone
            FROM drivers
            WHERE user_id IS NULL
            ORDER BY id
            """
        )
    ).fetchall()

    for index, driver in enumerate(drivers):
        email = "conductor@fero.com" if index == 0 else f"conductor{index + 1}@fero.com"
        result = connection.execute(
            sa.text(
                """
                INSERT INTO users (
                    email, password_hash, first_name, last_name, phone, role, active
                )
                VALUES (
                    :email, :password_hash, :first_name, :last_name, :phone, 'conductor', true
                )
                RETURNING id
                """
            ),
            {
                "email": email,
                "password_hash": DEMO_PASSWORD_HASH,
                "first_name": driver.first_name,
                "last_name": driver.last_name,
                "phone": driver.phone,
            },
        )
        user_id = result.scalar_one()
        connection.execute(
            sa.text("UPDATE drivers SET user_id = :user_id WHERE id = :driver_id"),
            {"user_id": user_id, "driver_id": driver.id},
        )


def upgrade() -> None:
    bind = op.get_bind()
    USER_ROLE.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("role", USER_ROLE, nullable=False),
        sa.Column("sector_id", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["sector_id"], ["sectors.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_role_active", "users", ["role", "active"])

    op.add_column(
        "vehicles",
        sa.Column("ideal_operators_count", sa.Integer(), server_default="1", nullable=False),
    )

    op.add_column("drivers", sa.Column("user_id", sa.Integer(), nullable=True))
    _backfill_driver_users(bind)
    op.alter_column("drivers", "user_id", nullable=False)
    op.create_foreign_key("fk_drivers_user_id", "drivers", "users", ["user_id"], ["id"])
    op.create_unique_constraint("uq_drivers_user_id", "drivers", ["user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_drivers_user_id", "drivers", type_="unique")
    op.drop_constraint("fk_drivers_user_id", "drivers", type_="foreignkey")
    op.drop_column("drivers", "user_id")
    op.drop_column("vehicles", "ideal_operators_count")
    op.drop_index("ix_users_role_active", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_table("users")
    USER_ROLE.drop(op.get_bind(), checkfirst=True)
