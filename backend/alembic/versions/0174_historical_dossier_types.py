"""Link historical records to the application dossier type catalog."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0174_historical_dossier_types"
down_revision: str | None = "0173_data_manager_legacy_records"
branch_labels: str | Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("historical_nominations") as batch:
        batch.add_column(sa.Column("dossier_type_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_historical_nominations_dossier_type_id_dossier_types",
            "dossier_types",
            ["dossier_type_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_index(
            "ix_historical_nominations_dossier_type_id", ["dossier_type_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("historical_nominations") as batch:
        batch.drop_index("ix_historical_nominations_dossier_type_id")
        batch.drop_constraint(
            "fk_historical_nominations_dossier_type_id_dossier_types",
            type_="foreignkey",
        )
        batch.drop_column("dossier_type_id")
