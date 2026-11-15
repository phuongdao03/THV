"""Add the isolated historical data manager role and capabilities."""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision: str = "0166_data_manager_role"
down_revision: str | None = "0165_submission_fee_test_exemption"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_CODE = "DATA_MANAGER"
PERMISSION_CODES = (
    "historical.records.read",
    "historical.records.manage",
    "historical.records.submit",
    "historical.documents.manage",
    "historical.import.manage",
)


def _table(name: str, *columns: tuple[str, sa.types.TypeEngine]) -> sa.TableClause:
    return sa.table(name, *(sa.column(column, type_) for column, type_ in columns))


def upgrade() -> None:
    bind = op.get_bind()
    roles = _table("roles", ("id", sa.Uuid()), ("code", sa.String()))
    permissions = _table("permissions", ("id", sa.Uuid()), ("code", sa.String()))
    role_permissions = _table(
        "role_permissions",
        ("role_id", sa.Uuid()),
        ("permission_id", sa.Uuid()),
    )

    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == ROLE_CODE)
    ).scalar_one_or_none()
    if role_id is None:
        role_id = uuid4()
        bind.execute(roles.insert().values(id=role_id, code=ROLE_CODE))

    existing_permissions = dict(
        bind.execute(
            sa.select(permissions.c.code, permissions.c.id).where(
                permissions.c.code.in_(PERMISSION_CODES)
            )
        ).all()
    )
    missing = [
        {"id": uuid4(), "code": code}
        for code in PERMISSION_CODES
        if code not in existing_permissions
    ]
    if missing:
        bind.execute(permissions.insert(), missing)
        existing_permissions.update({row["code"]: row["id"] for row in missing})

    existing_links = set(
        bind.execute(
            sa.select(role_permissions.c.permission_id).where(
                role_permissions.c.role_id == role_id
            )
        ).scalars()
    )
    missing_links = [
        {"role_id": role_id, "permission_id": existing_permissions[code]}
        for code in PERMISSION_CODES
        if existing_permissions[code] not in existing_links
    ]
    if missing_links:
        bind.execute(role_permissions.insert(), missing_links)
    permitted_permission_ids = tuple(
        existing_permissions[code] for code in PERMISSION_CODES
    )
    bind.execute(
        role_permissions.delete().where(
            role_permissions.c.role_id == role_id,
            role_permissions.c.permission_id.not_in(permitted_permission_ids),
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    roles = _table("roles", ("id", sa.Uuid()), ("code", sa.String()))
    permissions = _table("permissions", ("id", sa.Uuid()), ("code", sa.String()))
    role_permissions = _table(
        "role_permissions",
        ("role_id", sa.Uuid()),
        ("permission_id", sa.Uuid()),
    )
    role_id = bind.execute(
        sa.select(roles.c.id).where(roles.c.code == ROLE_CODE)
    ).scalar_one_or_none()
    if role_id is None:
        return

    user_roles = _table("user_roles", ("user_id", sa.Uuid()), ("role_id", sa.Uuid()))
    if bind.execute(
        sa.select(user_roles.c.user_id).where(user_roles.c.role_id == role_id).limit(1)
    ).first():
        raise RuntimeError("Cannot remove DATA_MANAGER while accounts still use it.")

    for table_name, column_name in (
        ("staff_invitations", "role_code"),
        ("privileged_actions", "requested_role_code"),
    ):
        table = _table(table_name, (column_name, sa.String()))
        if bind.execute(
            sa.select(table.c[column_name])
            .where(table.c[column_name] == ROLE_CODE)
            .limit(1)
        ).first():
            raise RuntimeError(
                f"Cannot remove DATA_MANAGER while {table_name} history references it."
            )

    permission_ids = tuple(
        bind.execute(
            sa.select(permissions.c.id).where(permissions.c.code.in_(PERMISSION_CODES))
        ).scalars()
    )
    bind.execute(role_permissions.delete().where(role_permissions.c.role_id == role_id))
    bind.execute(roles.delete().where(roles.c.id == role_id))

    user_permissions = _table(
        "user_permissions",
        ("user_id", sa.Uuid()),
        ("permission_id", sa.Uuid()),
    )
    remaining_role_permissions = _table(
        "role_permissions",
        ("role_id", sa.Uuid()),
        ("permission_id", sa.Uuid()),
    )
    for permission_id in permission_ids:
        still_used = (
            bind.execute(
                sa.select(remaining_role_permissions.c.role_id)
                .where(remaining_role_permissions.c.permission_id == permission_id)
                .limit(1)
            ).first()
            or bind.execute(
                sa.select(user_permissions.c.user_id)
                .where(user_permissions.c.permission_id == permission_id)
                .limit(1)
            ).first()
        )
        if not still_used:
            bind.execute(permissions.delete().where(permissions.c.id == permission_id))
