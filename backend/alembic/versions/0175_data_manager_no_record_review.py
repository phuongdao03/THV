"""Remove the obsolete record-submission permission from DATA_MANAGER."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0175_data_manager_no_record_review"
down_revision: str | None = "0174_historical_dossier_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _set_submission_permission(assigned: bool) -> None:
    bind = op.get_bind()
    roles = sa.table(
        "roles", sa.column("id", sa.Uuid()), sa.column("code", sa.String())
    )
    permissions = sa.table(
        "permissions", sa.column("id", sa.Uuid()), sa.column("code", sa.String())
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )
    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == "DATA_MANAGER")
    ).scalar_one_or_none()
    permission_id = bind.execute(
        sa.select(permissions.c.id).where(
            permissions.c.code == "historical.records.submit"
        )
    ).scalar_one_or_none()
    if role_id is not None and permission_id is not None:
        association = sa.and_(
            role_permissions.c.role_id == role_id,
            role_permissions.c.permission_id == permission_id,
        )
        exists = bind.execute(
            sa.select(role_permissions.c.role_id).where(association)
        ).first()
        if assigned and exists is None:
            bind.execute(
                role_permissions.insert().values(
                    role_id=role_id, permission_id=permission_id
                )
            )
        elif not assigned:
            bind.execute(role_permissions.delete().where(association))


def upgrade() -> None:
    _set_submission_permission(assigned=False)


def downgrade() -> None:
    _set_submission_permission(assigned=True)
