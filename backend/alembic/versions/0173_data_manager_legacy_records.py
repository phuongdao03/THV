"""Restore narrow historical-record editing for DATA_MANAGER."""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision: str = "0173_data_manager_legacy_records"
down_revision: str | None = "0172_certificate_archives"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_CODE = "DATA_MANAGER"
ALLOWLIST = (
    "historical.records.read",
    "historical.records.manage",
    "historical.records.submit",
    "historical.documents.manage",
    "public_content.works.manage",
    "certificate_content.edit",
    "certificate_archives.manage",
)
PREVIOUS_ALLOWLIST = (
    "public_content.works.manage",
    "certificate_content.edit",
    "certificate_archives.manage",
)


def _tables():
    return (
        sa.table("roles", sa.column("id", sa.Uuid()), sa.column("code", sa.String())),
        sa.table(
            "permissions",
            sa.column("id", sa.Uuid()),
            sa.column("code", sa.String()),
        ),
        sa.table(
            "role_permissions",
            sa.column("role_id", sa.Uuid()),
            sa.column("permission_id", sa.Uuid()),
        ),
    )


def _replace_permissions(codes: tuple[str, ...]) -> None:
    bind = op.get_bind()
    roles, permissions, role_permissions = _tables()
    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == ROLE_CODE)
    ).scalar_one_or_none()
    if role_id is None:
        return

    permission_ids: list[object] = []
    for code in codes:
        permission_id = bind.execute(
            sa.select(permissions.c.id).where(permissions.c.code == code)
        ).scalar_one_or_none()
        if permission_id is None:
            permission_id = uuid4()
            bind.execute(permissions.insert().values(id=permission_id, code=code))
        permission_ids.append(permission_id)

    bind.execute(
        role_permissions.delete().where(
            role_permissions.c.role_id == role_id,
            role_permissions.c.permission_id.not_in(tuple(permission_ids)),
        )
    )
    existing_ids = set(
        bind.execute(
            sa.select(role_permissions.c.permission_id).where(
                role_permissions.c.role_id == role_id
            )
        ).scalars()
    )
    missing = [
        {"role_id": role_id, "permission_id": permission_id}
        for permission_id in permission_ids
        if permission_id not in existing_ids
    ]
    if missing:
        bind.execute(role_permissions.insert(), missing)


def upgrade() -> None:
    _replace_permissions(ALLOWLIST)


def downgrade() -> None:
    _replace_permissions(PREVIOUS_ALLOWLIST)
