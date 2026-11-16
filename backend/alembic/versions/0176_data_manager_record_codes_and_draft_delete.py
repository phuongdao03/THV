"""Add THV aliases, idempotent historical creation, and source draft deletion."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision: str = "0176_data_manager_record_codes_and_draft_delete"
down_revision: str | None = "0175_data_manager_no_record_review"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _record_year(value: object) -> int:
    if isinstance(value, datetime):
        return value.year
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.year


def upgrade() -> None:
    op.add_column(
        "historical_nominations",
        sa.Column("legacy_code", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "historical_nominations",
        sa.Column("creation_request_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "historical_nominations",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column(
            "historical_nominations",
            "code",
            existing_type=sa.String(length=40),
            type_=sa.String(length=48),
            existing_nullable=False,
        )

    table = sa.table(
        "historical_nominations",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("legacy_code", sa.String()),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(table.c.id, table.c.code, table.c.created_at)).all()
    for record_id, old_code, created_at in rows:
        identifier = record_id if isinstance(record_id, UUID) else UUID(str(record_id))
        new_code = f"THV-LS-{_record_year(created_at)}-{identifier.hex.upper()}"
        bind.execute(
            table.update()
            .where(table.c.id == record_id)
            .values(code=new_code, legacy_code=old_code)
        )

    op.create_index(
        "uq_historical_nominations_legacy_code",
        "historical_nominations",
        ["legacy_code"],
        unique=True,
    )
    op.create_index(
        "uq_historical_nomination_create_request",
        "historical_nominations",
        ["created_by_user_id", "creation_request_id"],
        unique=True,
    )


def downgrade() -> None:
    table = sa.table(
        "historical_nominations",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("legacy_code", sa.String()),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(table.c.id, table.c.legacy_code)).all()
    for record_id, legacy_code in rows:
        identifier = record_id if isinstance(record_id, UUID) else UUID(str(record_id))
        old_code = legacy_code or f"HIST-{identifier.hex[:16].upper()}"
        bind.execute(
            table.update().where(table.c.id == record_id).values(code=old_code)
        )

    op.drop_index(
        "uq_historical_nomination_create_request",
        table_name="historical_nominations",
    )
    op.drop_index(
        "uq_historical_nominations_legacy_code",
        table_name="historical_nominations",
    )
    with op.batch_alter_table("historical_nominations") as batch_op:
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("creation_request_id")
        batch_op.drop_column("legacy_code")
        if op.get_bind().dialect.name == "postgresql":
            batch_op.alter_column(
                "code",
                existing_type=sa.String(length=48),
                type_=sa.String(length=40),
                existing_nullable=False,
            )
