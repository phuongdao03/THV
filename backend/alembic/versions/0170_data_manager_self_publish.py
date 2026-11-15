"""Replace spreadsheet import access with LEGACY self-publication."""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision: str = "0170_data_manager_self_publish"
down_revision: str | None = "0169_historical_record_workspace"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_CODE = "DATA_MANAGER"
PUBLISH_PERMISSION = "historical.records.publish"
RETIRED_PERMISSION = "historical.import.manage"
ALLOWLIST = (
    "historical.records.read",
    "historical.records.manage",
    "historical.documents.manage",
    PUBLISH_PERMISSION,
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


def upgrade() -> None:
    bind = op.get_bind()
    roles, permissions, role_permissions = _tables()
    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == ROLE_CODE)
    ).scalar_one_or_none()
    if role_id is None:
        return

    permission_id = bind.execute(
        sa.select(permissions.c.id).where(permissions.c.code == PUBLISH_PERMISSION)
    ).scalar_one_or_none()
    if permission_id is None:
        permission_id = uuid4()
        bind.execute(
            permissions.insert().values(id=permission_id, code=PUBLISH_PERMISSION)
        )
    other_ids = bind.execute(
        sa.select(permissions.c.id).where(permissions.c.code.in_(ALLOWLIST[:-1]))
    ).scalars().all()
    allowed_ids = (*other_ids, permission_id)
    bind.execute(
        role_permissions.delete().where(
            role_permissions.c.role_id == role_id,
            role_permissions.c.permission_id.not_in(allowed_ids),
        )
    )
    existing_ids = set(
        bind.execute(
            sa.select(role_permissions.c.permission_id).where(
                role_permissions.c.role_id == role_id
            )
        ).scalars()
    )
    links = [
        {"role_id": role_id, "permission_id": item}
        for item in allowed_ids
        if item not in existing_ids
    ]
    if links:
        bind.execute(role_permissions.insert(), links)


def downgrade() -> None:
    bind = op.get_bind()
    roles, permissions, role_permissions = _tables()
    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == ROLE_CODE)
    ).scalar_one_or_none()
    publish_id = bind.execute(
        sa.select(permissions.c.id).where(permissions.c.code == PUBLISH_PERMISSION)
    ).scalar_one_or_none()
    if role_id is not None and publish_id is not None:
        bind.execute(
            role_permissions.delete().where(
                role_permissions.c.role_id == role_id,
                role_permissions.c.permission_id == publish_id,
            )
        )
        retired_id = bind.execute(
            sa.select(permissions.c.id).where(permissions.c.code == RETIRED_PERMISSION)
        ).scalar_one_or_none()
        if retired_id is not None:
            bind.execute(
                role_permissions.insert().values(
                    role_id=role_id,
                    permission_id=retired_id,
                )
            )
