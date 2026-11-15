"""Link historical records to the application dossier type catalog."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0174_historical_dossier_types"
down_revision: str | None = "0173_data_manager_legacy_records"
branch_labels: str | Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "historical_nominations",
        sa.Column("dossier_type_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_historical_nominations_dossier_type_id_dossier_types",
        "historical_nominations",
        "dossier_types",
        ["dossier_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_historical_nominations_dossier_type_id",
        "historical_nominations",
        ["dossier_type_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_historical_nominations_dossier_type_id",
        table_name="historical_nominations",
    )
    op.drop_constraint(
        "fk_historical_nominations_dossier_type_id_dossier_types",
        "historical_nominations",
        type_="foreignkey",
    )
    op.drop_column("historical_nominations", "dossier_type_id")
